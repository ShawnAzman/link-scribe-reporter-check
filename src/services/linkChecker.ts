
import { LinkCheckResult } from "@/types/linkTypes";
import { toast } from "sonner";

export const checkLinks = async (url: string): Promise<LinkCheckResult[]> => {
  try {
    // Show initial loading toast
    toast.info("Fetching page content...", { id: "fetch-status" });
    
    // Use a public CORS proxy
    const corsProxy = "https://corsproxy.io/?";
    const targetUrl = encodeURIComponent(url);
    const proxyUrl = `${corsProxy}${targetUrl}`;
    
    // Fetch the page content
    const pageResponse = await fetch(proxyUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      }
    });
    
    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch the page: ${pageResponse.status} ${pageResponse.statusText}`);
    }
    
    const html = await pageResponse.text();
    toast.info("Extracting links...", { id: "fetch-status" });
    
    // Extract links using regex
    const links = extractLinks(html, url);
    
    // Deduplicate links
    const uniqueLinks = [...new Set(links)];
    
    // Limit to 25 links for demo purposes
    const limitedLinks = uniqueLinks.slice(0, 25);
    toast.success(`Found ${limitedLinks.length} links to check`, { id: "fetch-status" });
    
    if (limitedLinks.length === 0) {
      return [];
    }
    
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
  // More robust regex pattern for href attributes
  const hrefRegex = /href=["']((?:(?:https?|ftp):\/\/|\/)[^"'\s>]+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1];
      
      // Skip anchor links and javascript URLs
      if (href && !href.startsWith("javascript:")) {
        // Resolve relative URLs
        try {
          // Handle both absolute and relative URLs
          const resolvedUrl = new URL(href, baseUrl).toString();
          links.push(resolvedUrl);
        } catch (e) {
          // Skip invalid URLs
          console.warn("Skipping invalid URL:", href);
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
  const totalLinks = links.length;
  
  toast.info(`Starting to check ${totalLinks} links...`, { id: "check-progress" });
  
  for (let i = 0; i < links.length; i += batchSize) {
    const batch = links.slice(i, i + batchSize);
    const batchPromises = batch.map(checkSingleLink);
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Update toast with progress
    const progress = Math.min(100, Math.round(((i + batchSize) / links.length) * 100));
    toast.info(`Checking links: ${progress}% complete`, { id: "check-progress" });
  }
  
  const brokenCount = results.filter(r => !r.isWorking).length;
  toast.dismiss("check-progress");
  
  if (brokenCount > 0) {
    toast.warning(`Found ${brokenCount} broken link${brokenCount > 1 ? 's' : ''}`);
  } else {
    toast.success("All links are working properly!");
  }
  
  return results;
}

async function checkSingleLink(url: string): Promise<LinkCheckResult> {
  try {
    // Add cache-busting parameter to avoid cached responses
    const urlWithCacheBuster = new URL(url);
    urlWithCacheBuster.searchParams.append('_cb', Date.now().toString());
    
    // For external URLs, use the same CORS proxy
    const corsProxy = "https://corsproxy.io/?";
    const targetUrl = encodeURIComponent(urlWithCacheBuster.toString());
    const proxyUrl = `${corsProxy}${targetUrl}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    try {
      const response = await fetch(proxyUrl, {
        method: "HEAD", // Try HEAD first
        redirect: "follow",
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      return {
        url,
        isWorking: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `${response.status} ${response.statusText}`,
      };
    } catch (headError) {
      // If HEAD fails, try GET instead (some servers don't support HEAD)
      const getController = new AbortController();
      const getTimeoutId = setTimeout(() => getController.abort(), 8000);
      
      try {
        const response = await fetch(proxyUrl, {
          method: "GET",
          redirect: "follow",
          signal: getController.signal,
        });
        
        clearTimeout(getTimeoutId);
        
        return {
          url,
          isWorking: response.ok,
          statusCode: response.status,
          error: response.ok ? undefined : `${response.status} ${response.statusText}`,
        };
      } catch (getError) {
        clearTimeout(getTimeoutId);
        throw getError;
      }
    }
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
