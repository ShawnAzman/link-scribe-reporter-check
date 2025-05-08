
import { LinkCheckResult } from "@/types/linkTypes";
import { toast } from "sonner";

export const checkLinks = async (url: string): Promise<LinkCheckResult[]> => {
  try {
    // Add timestamp to prevent caching issues
    const timestamp = new Date().getTime();
    const apiUrl = `/api/check-links?url=${encodeURIComponent(url)}&_t=${timestamp}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      throw new Error(`Error: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Non-JSON response received:', contentType);
      const text = await response.text();
      console.error('Response body:', text.substring(0, 500) + '...');
      throw new Error('Server returned non-JSON response');
    }
    
    const data = await response.json();
    
    if (!data || !Array.isArray(data.results)) {
      console.error('Invalid response structure:', data);
      throw new Error('Invalid server response structure');
    }
    
    return data.results || [];
  } catch (error) {
    console.error("Error checking links:", error);
    toast.error(`Failed to check links: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
};
