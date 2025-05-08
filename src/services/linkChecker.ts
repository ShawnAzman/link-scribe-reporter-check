
import { LinkCheckResult } from "@/types/linkTypes";
import { toast } from "sonner";

export const checkLinks = async (url: string): Promise<LinkCheckResult[]> => {
  try {
    const response = await fetch(`/api/check-links?url=${encodeURIComponent(url)}`);
    
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    
    // First try to parse as text to see if we got HTML instead of JSON
    const text = await response.text();
    
    // Try to parse the text as JSON
    try {
      const data = JSON.parse(text);
      return data.results || [];
    } catch (jsonError) {
      console.error("Error parsing JSON response:", jsonError);
      console.error("Response received:", text.substring(0, 200) + "..."); // Log first 200 chars
      toast.error("Server returned invalid data. Please try again.");
      throw new Error("Invalid JSON response");
    }
  } catch (error) {
    console.error("Error checking links:", error);
    toast.error("Failed to check links. Please try again.");
    throw error;
  }
};
