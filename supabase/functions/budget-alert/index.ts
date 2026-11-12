import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

interface ExpenseRecord {
  id: string;
  user_id: string;
  category_id: number;
  amount: number;
  spent_on: string;
  is_archived: boolean;
}

interface ProfileRecord {
  id: string;
  email_alerts?: boolean;
  warn_80?: boolean;
  warn_100?: boolean;
}

interface BudgetRecord {
  id: string;
  user_id: string;
  category_id: number;
  month: number;
  year: number;
  amount: number;
  is_archived: boolean;
}

interface DatabaseWebhookPayload {
  type: "INSERT" | "UPDATE";
  table: string;
  schema: string;
  record: ExpenseRecord | ProfileRecord | BudgetRecord;
  old_record?: ExpenseRecord | ProfileRecord | BudgetRecord | null;
}

interface AffectedBudget {
  userId: string;
  categoryId: number;
  month: number;
  year: number;
  budgetId?: string;
  archived?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(amount);
  }
}

function getMonthDetails(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);

  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  const startDate =
    `${year}-${String(month).padStart(2, "0")}-01`;

  const nextMonthDate = new Date(
    Date.UTC(year, month, 1),
  );

  const endDate =
    `${nextMonthDate.getUTCFullYear()}-${String(
      nextMonthDate.getUTCMonth() + 1,
    ).padStart(2, "0")}-01`;

  return {
    month,
    year,
    startDate,
    endDate,
  };
}

function createEmailContent(
  name: string,
  categoryName: string,
  threshold: number,
  spent: number,
  budget: number,
  currency: string,
) {
  const isLimitReached = threshold === 100;

  const subject = isLimitReached
    ? `Budget Limit Reached - ${categoryName}`
    : `Budget Warning - ${categoryName} is at 80%`;

  const percentage = Math.round((spent / budget) * 100);

  const formattedSpent = formatMoney(spent, currency);
  const formattedBudget = formatMoney(budget, currency);

  const heading = isLimitReached
    ? "Budget Limit Reached!"
    : "Budget Warning!";

  const message = isLimitReached
    ? `You have reached or exceeded your budget limit for ${categoryName}.`
    : `You have already used 80% or more of your budget for ${categoryName}.`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(subject)}</title>
      </head>

      <body style="
        margin: 0;
        padding: 24px;
        background-color: #f4f4f5;
        font-family: Arial, sans-serif;
      ">
        <div style="
          max-width: 560px;
          margin: auto;
          padding: 28px;
          background-color: #ffffff;
          border-radius: 12px;
        ">
          <h2 style="color: #18181b;">
            ${heading}
          </h2>

          <p style="color: #52525b;">
            Hello ${escapeHtml(name)},
          </p>

          <p style="color: #52525b;">
            ${message}
          </p>

          <div style="
            margin: 24px 0;
            padding: 20px;
            background-color: #f4f4f5;
            border-radius: 8px;
          ">
            <p>
              <strong>Category:</strong>
              ${escapeHtml(categoryName)}
            </p>

            <p>
              <strong>Amount Spent:</strong>
              ${formattedSpent}
            </p>

            <p>
              <strong>Monthly Budget:</strong>
              ${formattedBudget}
            </p>

            <p>
              <strong>Budget Used:</strong>
              ${percentage}%
            </p>
          </div>

          <p style="color: #52525b;">
            ${
              isLimitReached
                ? "Consider reviewing your expenses and adjusting your spending."
                : "Keep track of your expenses to avoid exceeding your monthly budget."
            }
          </p>

          <p style="
            margin-top: 30px;
            color: #71717a;
            font-size: 13px;
          ">
            Track Mo, Pake Ko!
          </p>
        </div>
      </body>
    </html>
  `;

  const text = [
    heading,
    "",
    `Hello ${name},`,
    "",
    message,
    "",
    `Category: ${categoryName}`,
    `Amount Spent: ${formattedSpent}`,
    `Monthly Budget: ${formattedBudget}`,
    `Budget Used: ${percentage}%`,
    "",
    isLimitReached
      ? "Consider reviewing your expenses and adjusting your spending."
      : "Keep track of your expenses to avoid exceeding your monthly budget.",
    "",
    "Track Mo, Pake Ko!",
  ].join("\n");

  return {
    subject,
    html,
    text,
  };
}

console.info("Budget Alert function started.");

export default {
  fetch: withSupabase(
    { auth: "secret" },
    async (req, ctx) => {
      if (req.method !== "POST") {
        return Response.json(
          { error: "Method not allowed." },
          { status: 405 },
        );
      }

      try {
        const payload: DatabaseWebhookPayload = await req.json();

        if (
          payload.schema !== "public" ||
          !["expenses", "profiles", "budgets"].includes(payload.table) ||
          (payload.type !== "INSERT" && payload.type !== "UPDATE")
        ) {
          return Response.json({
            message: "Webhook event ignored.",
          });
        }

        const supabase = ctx.supabaseAdmin;

        const affectedBudgets = new Map<
          string,
          AffectedBudget
        >();
        const forcedThresholds = new Set<number>();

        if (payload.table === "expenses") {
          const records = [
            payload.old_record,
            payload.record,
          ].filter(
            (record): record is ExpenseRecord =>
              record !== null &&
              record !== undefined &&
              "user_id" in record &&
              "category_id" in record &&
              "spent_on" in record,
          );

          for (const item of records) {
            if (!item.user_id || !item.category_id || !item.spent_on) {
              continue;
            }

            const { month, year } = getMonthDetails(item.spent_on);
            const key = [item.user_id, item.category_id, month, year].join("-");

            affectedBudgets.set(key, {
              userId: item.user_id,
              categoryId: item.category_id,
              month,
              year,
            });
          }
        } else if (payload.table === "profiles") {
          // Re-check current-month budgets when notification preferences change.
          const profileRecord = payload.record as ProfileRecord;
          if (!profileRecord.id) {
            return Response.json({ message: "Profile event ignored." });
          }

          const localDateParts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Manila",
            month: "numeric",
            year: "numeric",
          }).formatToParts(new Date());
          const month = Number(localDateParts.find((part) => part.type === "month")?.value);
          const year = Number(localDateParts.find((part) => part.type === "year")?.value);

          const { data: activeBudgets, error: activeBudgetsError } =
            await supabase
              .from("budgets")
              .select("id, category_id")
              .eq("user_id", profileRecord.id)
              .eq("month", month)
              .eq("year", year)
              .eq("is_archived", false);

          if (activeBudgetsError) throw activeBudgetsError;

          // Allow a fresh alert when the user re-enables email alerts
          // or re-enables an individual threshold warning.
          const previousProfile = payload.old_record as ProfileRecord | null;
          const resetThresholds: number[] = [];
          if (!previousProfile?.email_alerts && profileRecord.email_alerts) {
            resetThresholds.push(80, 100);
          } else {
            if (!previousProfile?.warn_80 && profileRecord.warn_80) resetThresholds.push(80);
            if (!previousProfile?.warn_100 && profileRecord.warn_100) resetThresholds.push(100);
          }

          // Force a new alert cycle when a previously disabled preference is enabled.
          resetThresholds.forEach((threshold) => forcedThresholds.add(threshold));

          for (const budgetItem of activeBudgets || []) {
            const key = [profileRecord.id, budgetItem.category_id, month, year].join("-");
            affectedBudgets.set(key, {
              userId: profileRecord.id,
              categoryId: budgetItem.category_id,
              month,
              year,
              budgetId: budgetItem.id,
            });
          }
        } else {
          // Budget inserts, amount edits, category/month changes, and archive/restore.
          const records = [payload.old_record, payload.record].filter(
            (record): record is BudgetRecord =>
              record !== null &&
              record !== undefined &&
              "user_id" in record &&
              "category_id" in record &&
              "month" in record &&
              "year" in record &&
              "amount" in record,
          );

          for (const budgetRecord of records) {
            const key = [
              budgetRecord.user_id,
              budgetRecord.category_id,
              budgetRecord.month,
              budgetRecord.year,
            ].join("-");
            affectedBudgets.set(key, {
              userId: budgetRecord.user_id,
              categoryId: budgetRecord.category_id,
              month: budgetRecord.month,
              year: budgetRecord.year,
              budgetId: budgetRecord.id,
              archived: budgetRecord.is_archived,
            });
          }
        }

        let emailsSent = 0;
        let budgetsChecked = 0;

        for (const item of affectedBudgets.values()) {
          budgetsChecked++;

          const { data: profile, error: profileError } =
            await supabase
              .from("profiles")
              .select(
                "email, full_name, currency, email_alerts, warn_80, warn_100",
              )
              .eq("id", item.userId)
              .maybeSingle();

          if (profileError) {
            throw profileError;
          }

          if (!profile) {
            continue;
          }

          const { data: budget, error: budgetError } =
            await supabase
              .from("budgets")
              .select("id, amount")
              .eq("user_id", item.userId)
              .eq("category_id", item.categoryId)
              .eq("month", item.month)
              .eq("year", item.year)
              .eq("is_archived", false)
              .maybeSingle();

          if (budgetError) {
            throw budgetError;
          }

          if (!budget || Number(budget.amount) <= 0) {
            // An archived budget is below both thresholds. This resets its
            // crossing state so restoring it can create a fresh crossing.
            if (item.budgetId && item.archived) {
              for (const threshold of [80, 100]) {
                const { error: stateError } = await supabase.rpc(
                  "claim_budget_alert_crossing",
                  {
                    p_budget_id: item.budgetId,
                    p_threshold: threshold,
                    p_percentage: 0,
                    p_force: false,
                  },
                );
                if (stateError) throw stateError;
              }
            }
            continue;
          }

          // Retrieve the category name only when an active budget exists.
          const { data: category, error: categoryError } =
            await supabase
              .from("categories")
              .select("name")
              .eq("id", item.categoryId)
              .maybeSingle();

          if (categoryError) {
            throw categoryError;
          }

          const categoryName = category?.name || "Other";

          const { startDate, endDate } =
            getMonthDetails(
              `${item.year}-${String(item.month).padStart(2, "0")}-01`,
            );

          const { data: expenses, error: expensesError } =
            await supabase
              .from("expenses")
              .select("amount")
              .eq("user_id", item.userId)
              .eq("category_id", item.categoryId)
              .eq("is_archived", false)
              .gte("spent_on", startDate)
              .lt("spent_on", endDate);

          if (expensesError) {
            throw expensesError;
          }

          const totalSpent = (expenses || []).reduce(
            (total, expense) =>
              total + Number(expense.amount || 0),
            0,
          );

          const budgetAmount = Number(budget.amount);

          const percentage =
            (totalSpent / budgetAmount) * 100;

          const currency = profile.currency || "PHP";

          for (const threshold of [80, 100]) {
            // The database atomically tracks whether this threshold is
            // currently crossed and only grants one email per new crossing.
            const { data: alertCycle, error: claimError } = await supabase.rpc(
              "claim_budget_alert_crossing",
              {
                p_budget_id: budget.id,
                p_threshold: threshold,
                p_percentage: percentage,
                p_force: forcedThresholds.has(threshold),
              },
            );

            if (claimError) throw claimError;
            if (alertCycle === null || alertCycle === undefined) continue;

            const thresholdEnabled =
              threshold === 80 ? profile.warn_80 : profile.warn_100;
            if (!profile.email || !profile.email_alerts || !thresholdEnabled) {
              continue;
            }

            // Reserve this specific crossing cycle to make webhook retries safe.
            const { error: logError } = await supabase
              .from("email_notification_logs")
              .insert({
                user_id: item.userId,
                notification_type: "budget_alert",
                budget_id: budget.id,
                threshold,
                alert_cycle: alertCycle,
              });

            if (logError?.code === "23505") continue;
            if (logError) throw logError;

            const brevoApiKey = Deno.env.get(
              "BREVO_API_KEY",
            );

            const senderEmail = Deno.env.get(
              "BREVO_SENDER_EMAIL",
            );

            const senderName =
              Deno.env.get("BREVO_SENDER_NAME") ||
              "Track Mo, Pake Ko!";

            if (!brevoApiKey || !senderEmail) {
              await supabase
                .from("email_notification_logs")
                .delete()
                .eq("user_id", item.userId)
                .eq("budget_id", budget.id)
                .eq("threshold", threshold)
                .eq("alert_cycle", alertCycle)
                .eq("notification_type", "budget_alert");

              await supabase.rpc("claim_budget_alert_crossing", {
                p_budget_id: budget.id,
                p_threshold: threshold,
                p_percentage: 0,
                p_force: false,
              });

              throw new Error(
                "Brevo environment variables are missing.",
              );
            }

            const emailContent = createEmailContent(
              profile.full_name || "there",
              categoryName,
              threshold,
              totalSpent,
              budgetAmount,
              currency,
            );

            const brevoResponse = await fetch(
              "https://api.brevo.com/v3/smtp/email",
              {
                method: "POST",
                headers: {
                  "accept": "application/json",
                  "api-key": brevoApiKey,
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  sender: {
                    name: senderName,
                    email: senderEmail,
                  },
                  to: [
                    {
                      email: profile.email,
                      name: profile.full_name || "User",
                    },
                  ],
                  subject: emailContent.subject,
                  htmlContent: emailContent.html,
                  textContent: emailContent.text,
                }),
              },
            );

            if (!brevoResponse.ok) {
              const errorText = await brevoResponse.text();

              // Remove the reservation so a future expense update
              // can retry sending the notification.
              await supabase
                .from("email_notification_logs")
                .delete()
                .eq("user_id", item.userId)
                .eq("budget_id", budget.id)
                .eq("threshold", threshold)
                .eq("alert_cycle", alertCycle)
                .eq("notification_type", "budget_alert");

              await supabase.rpc("claim_budget_alert_crossing", {
                p_budget_id: budget.id,
                p_threshold: threshold,
                p_percentage: 0,
                p_force: false,
              });

              console.error(
                "Brevo email error:",
                errorText,
              );

              throw new Error(
                `Brevo request failed with status ${brevoResponse.status}.`,
              );
            }

            emailsSent++;

            console.info(
              `Budget alert sent: ${categoryName} - ${threshold}%`,
            );
          }
        }

        return Response.json({
          success: true,
          message: "Budget alert processing completed.",
          budgetsChecked,
          emailsSent,
        });
      } catch (error) {
        console.error("Budget Alert error:", error);

        return Response.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "An unexpected error occurred.",
          },
          { status: 500 },
        );
      }
    },
  ),
};