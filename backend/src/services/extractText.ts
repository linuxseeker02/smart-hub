// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
import mammoth from "mammoth";

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