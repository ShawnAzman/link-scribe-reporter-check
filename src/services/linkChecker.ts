
import { LinkCheckResult } from "@/types/linkTypes";
import { toast } from "sonner";

export const checkLinks = async (url: string): Promise<LinkCheckResult[]> => {
  try {
    const response = await fetch(`/api/check-links?url=${encodeURIComponent(url)}`);
    
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error("Error checking links:", error);
    toast.error("Failed to check links. Please try again.");
    throw error;
  }
};
