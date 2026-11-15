// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";

export const extractTextFromUrl = async (
  fileUrl: string,
  fileType: "pdf" | "docx" | "ppt"
): Promise<string> => {
  try {
    if (fileType === "ppt") {
      return "";
    }

    const response = await fetch(fileUrl);

    if (!response.ok) {
      console.error(`Failed to fetch file from URL: ${fileUrl}`);
      return "";
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    let extractedText = "";

    if (fileType === "pdf") {
      const data = await pdfParse(buffer);
      extractedText = data.text;
    } else if (fileType === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    }

    const trimmedText = extractedText.trim();
    return trimmedText.substring(0, 4000);
  } catch (error) {
    console.error(`Error extracting text from ${fileType} file:`, error);
    return "";
  }
};

export type TimetableFileExtraction =
  | { status: "text_extracted"; text: string }
  | { status: "empty_text"; text: string }
  | { status: "ocr_completed"; text: string }
  | { status: "ocr_required"; text: ""; message: string };

/**
 * PDF text extraction is performed locally after downloading the Cloudinary
 * asset. Image timetables use Tesseract OCR before the AI parser is called.
 */
export const extractTimetableFile = async (
  file: Express.Multer.File
): Promise<TimetableFileExtraction> => {
  const isPdf = file.mimetype === "application/pdf";
  const url = file.path || file.filename;
  if (!url) {
    return { status: "empty_text", text: "" };
  }

  if (!isPdf) {
    const response = await fetch(url);
    if (!response.ok) {
      return { status: "ocr_required", text: "", message: "The uploaded image could not be downloaded for OCR." };
    }

    const worker = await createWorker("eng");
    try {
      const result = await worker.recognize(Buffer.from(await response.arrayBuffer()));
      const text = result.data.text.trim().substring(0, 12000);
      return text
        ? { status: "ocr_completed", text }
        : { status: "empty_text", text: "" };
    } finally {
      await worker.terminate();
    }
  }

  const text = await extractTextFromUrl(url, "pdf");
  return text
    ? { status: "text_extracted", text }
    : { status: "empty_text", text: "" };
};