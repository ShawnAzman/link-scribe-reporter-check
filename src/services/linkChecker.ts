
import { LinkCheckResult } from "@/types/linkTypes";
import { toast } from "sonner";

export const checkLinks = async (url: string): Promise<LinkCheckResult[]> => {
  try {
    // Perform a CORS request to the target URL using a cors-anywhere style proxy
    // For demo purposes, we'll use a public CORS proxy (in production, you'd use your own)
    const corsProxy = "https://corsproxy.io/?";
    const targetUrl = encodeURIComponent(url);
    const proxyUrl = `${corsProxy}${targetUrl}`;
    
    toast.info("Fetching page content...");
    
    // Fetch the page content
    const pageResponse = await fetch(proxyUrl);
    
    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch the page: ${pageResponse.status} ${pageResponse.statusText}`);
    }
    
    const html = await pageResponse.text();
    toast.info("Extracting links...");
    
    // Extract links using regex
    const links = extractLinks(html, url);
    
    // Deduplicate links
    const uniqueLinks = [...new Set(links)];
    
    // Limit to 25 links for demo purposes
    const limitedLinks = uniqueLinks.slice(0, 25);
    toast.info(`Checking ${limitedLinks.length} links...`);
    
    // Check links (with throttling to avoid too many concurrent requests)
    const results = await checkLinksInBatches(limitedLinks, 3);
    
    return results;
  } catch (error) {
    console.error("Error checking links:", error);
    toast.error(`Failed to check links: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
};

// Extract links from HTML using regex
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const hrefRegex = /href=["'](.*?)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1];
      
      // Skip anchor links and javascript URLs
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        // Resolve relative URLs
        try {
          const resolvedUrl = new URL(href, baseUrl).toString();
          links.push(resolvedUrl);
        } catch (e) {
          // Skip invalid URLs
          console.error("Error resolving URL:", href, e);
        }
      }
    } catch (e) {
      console.error("Error processing link:", e);
    }
  }

  return links;
}

// Process links in batches to avoid too many concurrent requests
async function checkLinksInBatches(links: string[], batchSize: number): Promise<LinkCheckResult[]> {
  const results: LinkCheckResult[] = [];
  
  for (let i = 0; i < links.length; i += batchSize) {
    const batch = links.slice(i, i + batchSize);
    const batchPromises = batch.map(checkSingleLink);
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Update toast with progress
    const progress = Math.min(100, Math.round(((i + batchSize) / links.length) * 100));
    if (progress < 100) {
      toast.info(`Checking links: ${progress}% complete...`, { id: "progress" });
    }
  }
  
  toast.dismiss("progress");
  return results;
}

async function checkSingleLink(url: string): Promise<LinkCheckResult> {
  try {
    // For external URLs, use the same CORS proxy
    const corsProxy = "https://corsproxy.io/?";
    const targetUrl = encodeURIComponent(url);
    const proxyUrl = `${corsProxy}${targetUrl}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(proxyUrl, {
      method: "HEAD", // Try HEAD first
      redirect: "follow",
      signal: controller.signal,
    }).catch(async () => {
      // If HEAD fails, try GET instead (some servers don't support HEAD)
      return fetch(proxyUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    });
    
    clearTimeout(timeoutId);
    
    return {
      url,
      isWorking: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `${response.status} ${response.statusText}`,
    };
  } catch (error) {
    let errorMessage = "Connection failed";
    
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "Request timeout";
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      url,
      isWorking: false,
      error: errorMessage,
    };
  }
}
