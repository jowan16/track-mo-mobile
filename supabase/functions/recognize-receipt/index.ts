import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const NVIDIA_OCR_URL =
  "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      if (req.method !== "POST") {
        return Response.json(
          { error: "Method not allowed." },
          { status: 405 },
        );
      }

      const userId = ctx.userClaims?.id;

      if (!userId) {
        return Response.json(
          { error: "Authentication required." },
          { status: 401 },
        );
      }

      const apiKey = Deno.env.get("NVIDIA_API_KEY");

      if (!apiKey) {
        return Response.json(
          { error: "OCR service is not configured." },
          { status: 500 },
        );
      }

      let body: { path?: string };

      try {
        body = await req.json();
      } catch {
        return Response.json(
          { error: "Invalid JSON request." },
          { status: 400 },
        );
      }

      const path = body.path;

      if (
        typeof path !== "string" ||
        !path.startsWith(`${userId}/`) ||
        path.includes("..")
      ) {
        return Response.json(
          { error: "Invalid receipt path." },
          { status: 400 },
        );
      }

      // Download using the authenticated user's RLS permissions.
      const { data: file, error: downloadError } =
        await ctx.supabase.storage
          .from("receipts")
          .download(path);

      if (downloadError || !file) {
        return Response.json(
          { error: "Receipt not found or access denied." },
          { status: 404 },
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return Response.json(
          { error: "Receipt image exceeds the 10 MB limit." },
          { status: 413 },
        );
      }

      const extension = path.split(".").pop()?.toLowerCase();

      let mimeType = file.type?.toLowerCase() || "";

      if (!mimeType || mimeType === "application/octet-stream") {
        if (extension === "jpg" || extension === "jpeg") {
          mimeType = "image/jpeg";
        } else if (extension === "png") {
          mimeType = "image/png";
        }
      }

      if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
        return Response.json(
          {
            error:
              "OCR currently supports JPEG and PNG images. Your receipt is still safely uploaded.",
          },
          { status: 415 },
        );
      }

      // Convert the downloaded image into a base64 data URL.
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";

      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(
          ...bytes.subarray(i, i + 0x8000),
        );
      }

      const base64 = btoa(binary);
      const imageDataUrl = `data:${mimeType};base64,${base64}`;

      let nvidiaResponse: Response;

      try {
        nvidiaResponse = await fetch(NVIDIA_OCR_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            input: [
              {
                type: "image_url",
                url: imageDataUrl,
              },
            ],
            merge_levels: ["paragraph"],
          }),
        });
      } catch {
        return Response.json(
          { error: "Unable to reach the OCR provider. Please try again." },
          { status: 502 },
        );
      }

      if (!nvidiaResponse.ok) {
        console.error(
          "NVIDIA OCR request failed with status:",
          nvidiaResponse.status,
        );

        return Response.json(
          { error: "The OCR provider could not process this receipt." },
          { status: 502 },
        );
      }

      let result: {
        model?: string;
        data?: Array<{
          text_detections?: Array<{
            text_prediction?: {
              text?: string;
              confidence?: number;
            };
            bounding_box?: unknown;
          }>;
        }>;
        usage?: unknown;
      };

      try {
        result = await nvidiaResponse.json();
      } catch {
        return Response.json(
          { error: "The OCR provider returned an invalid response." },
          { status: 502 },
        );
      }

      const detections =
        result.data?.[0]?.text_detections ?? [];

      const text = detections
        .map((item) => item.text_prediction?.text ?? "")
        .filter((value) => value.length > 0)
        .join("\n");

      return Response.json({
        success: true,
        model: result.model ?? "nvidia/nemotron-ocr-v2",
        text,
        detections,
        usage: result.usage ?? null,
      });
    },
  ),
};
