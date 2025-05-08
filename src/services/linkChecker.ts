
import { LinkCheckResult } from "@/types/linkTypes";
import { toast } from "sonner";

export const checkLinks = async (
  url: string, 
  recursive: boolean = false, 
  maxDepth: number = 3,
  onProgress?: (newResults: LinkCheckResult[]) => void,
  onPageChecked?: (count: number) => void,
  signal?: AbortSignal
): Promise<LinkCheckResult[]> => {
  try {
    // Show initial loading toast
    toast.info("Fetching page content...", { id: "fetch-status" });
    
    const allResults: LinkCheckResult[] = [];
    
    const visitedPages = new Set<string>();
    
    const pageQueue: Array<{url: string, depth: number}> = [{url, depth: 0}];
    
    let checkedPagesCount = 0;
    
    // Extract the base domain for the starting URL to only check pages on the same site
    const baseUrlObj = new URL(url);
    const baseDomain = baseUrlObj.hostname;
    
    // Try multiple CORS proxies in case one fails
    const corsProxies = [
      "https://api.allorigins.win/raw?url=",
      "https://corsproxy.io/?",
      "https://cors-anywhere.herokuapp.com/"
    ];
    
    let proxyUsed = "";
    
    // Process pages while there are still pages in the queue
    while (pageQueue.length > 0 && (!signal || !signal.aborted)) {
      const { url: currentUrl, depth: currentDepth } = pageQueue.shift()!;
      
      if (visitedPages.has(currentUrl)) {
        continue;
      }
      
      visitedPages.add(currentUrl);
      
      try {
        toast.info(`Checking page: ${currentUrl}`, { id: "fetch-status" });
        
        let html = null;
        let error = null;
        
        // Try each proxy until one works
        for (const proxy of corsProxies) {
          if (signal?.aborted) break;
          
          try {
            const targetUrl = encodeURIComponent(currentUrl);
            const proxyUrl = `${proxy}${targetUrl}`;
            
            console.log(`Trying proxy: ${proxy}`);
            
            // Fetch the page content with a timeout
            const controller = new AbortController();
            
            if (signal) {
              signal.addEventListener('abort', () => {
                controller.abort();
              });
            }
            
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const pageResponse = await fetch(proxyUrl, {
              headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml',
                'User-Agent': 'Mozilla/5.0 (compatible; LinkScribe/1.0)'
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!pageResponse.ok) {
              throw new Error(`Failed to fetch the page: ${pageResponse.status} ${pageResponse.statusText}`);
            }
            
            html = await pageResponse.text();
            proxyUsed = proxy;
            break; // Exit the loop if we successfully got the content
          } catch (err) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            error = err;
            console.log(`Proxy ${proxy} failed:`, err);
            // Continue to next proxy
          }
        }
        
        if (!html) {
          // If all proxies failed, throw the last error
          throw error || new Error("All proxies failed to fetch the content");
        }
        
        toast.info("Extracting links...", { id: "fetch-status" });
        
        // Extract links using regex
        const links = extractLinks(html, currentUrl);
        
        // Deduplicate links
        const uniqueLinks = [...new Set(links)];
        
        const linksToCheck = recursive ? uniqueLinks : uniqueLinks.slice(0, 25);
        
        if (linksToCheck.length === 0) {
          toast.info("No links found on the page", { id: "fetch-status" });
          checkedPagesCount++;
          if (onPageChecked) onPageChecked(checkedPagesCount);
          continue;
        }
        
        toast.success(`Found ${linksToCheck.length} links to check on ${currentUrl}`, { id: "fetch-status" });
        
        // Check links (with throttling to avoid too many concurrent requests)
        const results = await checkLinksInBatches(
          linksToCheck, 
          3, 
          proxyUsed, 
          currentUrl, 
          signal,
          (batchResults) => {
            if (onProgress) {
              onProgress(batchResults);
            }
          }
        );
        
        allResults.push(...results);
        
        checkedPagesCount++;
        if (onPageChecked) onPageChecked(checkedPagesCount);
        
        if (recursive && currentDepth < maxDepth && !signal?.aborted) {
          const newPages = results
            .filter(result => {
              if (!result.isWorking) return false;
              
              try {
                const linkUrl = new URL(result.url);
                
                return linkUrl.hostname === baseDomain && 
                       !result.url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|rar|mp3|mp4|webm|avi|mov|wmv|flv|doc|docx|xls|xlsx|ppt|pptx|txt|csv|json|xml|rss)$/i);
              } catch {
                return false;
              }
            })
            .map(result => ({
              url: result.url,
              depth: currentDepth + 1
            }));
          
          pageQueue.push(...newPages);
          
          toast.info(`Added ${newPages.length} new pages to check (depth ${currentDepth + 1}/${maxDepth})`, { id: "check-progress" });
        }
      } catch (error) {
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        
        console.error(`Error processing page ${currentUrl}:`, error);
        toast.error(`Error processing page ${currentUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        checkedPagesCount++;
        if (onPageChecked) onPageChecked(checkedPagesCount);
      }
    }
    
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    
    const brokenCount = allResults.filter(r => !r.isWorking).length;
    toast.dismiss("check-progress");
    toast.dismiss("fetch-status");
    
    if (brokenCount > 0) {
      toast.warning(`Found ${brokenCount} broken link${brokenCount > 1 ? 's' : ''} ${recursive ? `across ${checkedPagesCount} pages` : ''}`);
    } else {
      toast.success(`All links are working properly! ${recursive ? `Checked ${allResults.length} links across ${checkedPagesCount} pages.` : ''}`);
    }
    
    return allResults;
  } catch (error) {
    console.error("Error checking links:", error);
    
    if (error instanceof DOMException && error.name === "AbortError") {
      toast.info("Link checking was cancelled.");
    } else {
      toast.error(`Failed to check links: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    throw error;
  }
};

// Extract links from HTML using regex
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  
  try {
    // Create a DOM parser to handle HTML correctly
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Get all anchor elements
    const anchorElements = doc.querySelectorAll('a');
    
    anchorElements.forEach(anchor => {
      try {
        const href = anchor.getAttribute('href');
        
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
          try {
            // Handle both absolute and relative URLs
            const resolvedUrl = new URL(href, baseUrl).toString();
            links.push(resolvedUrl);
          } catch (e) {
            console.warn("Skipping invalid URL:", href);
          }
        }
      } catch (e) {
        console.error("Error processing link:", e);
      }
    });
  } catch (e) {
    // Fallback to regex if DOM parsing fails
    console.log("DOM parsing failed, falling back to regex");
    const hrefRegex = /href=["']((?:(?:https?|ftp):\/\/|\/)[^"'\s>]+)["']/gi;
    let match;
    
    while ((match = hrefRegex.exec(html)) !== null) {
      try {
        const href = match[1];
        
        if (href && !href.startsWith("javascript:") && !href.startsWith('#')) {
          try {
            const resolvedUrl = new URL(href, baseUrl).toString();
            links.push(resolvedUrl);
          } catch (e) {
            console.warn("Skipping invalid URL:", href);
          }
        }
      } catch (e) {
        console.error("Error processing link:", e);
      }
    }
  }

  return links;
}

// Process links in batches to avoid too many concurrent requests
async function checkLinksInBatches(
  links: string[], 
  batchSize: number, 
  proxyUsed: string,
  sourcePage?: string,
  signal?: AbortSignal,
  onBatchComplete?: (results: LinkCheckResult[]) => void
): Promise<LinkCheckResult[]> {
  const results: LinkCheckResult[] = [];
  const totalLinks = links.length;
  
  toast.info(`Starting to check ${totalLinks} links...`, { id: "check-progress" });
  
  for (let i = 0; i < links.length; i += batchSize) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    
    const batch = links.slice(i, i + batchSize);
    const batchPromises = batch.map(link => checkSingleLink(link, proxyUsed, sourcePage, signal));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    if (onBatchComplete) {
      onBatchComplete(batchResults);
    }
    
    // Update toast with progress
    const progress = Math.min(100, Math.round(((i + batch.length) / links.length) * 100));
    toast.info(`Checking links: ${progress}% complete`, { id: "check-progress" });
  }
  
  const brokenCount = results.filter(r => !r.isWorking).length;
  
  if (brokenCount > 0) {
    toast.warning(`Found ${brokenCount} broken link${brokenCount > 1 ? 's' : ''} on ${sourcePage || 'this page'}`);
  } else {
    toast.success(`All ${results.length} links on ${sourcePage || 'this page'} are working properly!`);
  }
  
  return results;
}

async function checkSingleLink(
  url: string, 
  proxyUsed: string,
  sourcePage?: string,
  signal?: AbortSignal
): Promise<LinkCheckResult> {
  try {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    
    // Add cache-busting parameter to avoid cached responses
    const urlWithCacheBuster = new URL(url);
    urlWithCacheBuster.searchParams.append('_cb', Date.now().toString());
    
    // For external URLs, use the same CORS proxy that worked for the initial page
    const targetUrl = encodeURIComponent(urlWithCacheBuster.toString());
    const proxyUrl = `${proxyUsed}${targetUrl}`;
    
    const controller = new AbortController();
    
    // Create a timeout for the request
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    if (signal) {
      signal.addEventListener('abort', () => {
        controller.abort();
      });
    }
    
    try {
      // Try a HEAD request first (faster)
      const response = await fetch(proxyUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkScribe/1.0)'
        }
      });
      
      clearTimeout(timeoutId);
      
      return {
        url,
        isWorking: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `${response.status} ${response.statusText}`,
        sourcePage
      };
    } catch (headError) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      
      console.log(`HEAD request failed for ${url}, trying GET`);
      
      // If HEAD fails, try GET instead (some servers don't support HEAD)
      const getController = new AbortController();
      
      if (signal) {
        signal.addEventListener('abort', () => {
          getController.abort();
        });
      }
      
      const getTimeoutId = setTimeout(() => getController.abort(), 8000);
      
      try {
        const response = await fetch(proxyUrl, {
          method: "GET",
          redirect: "follow",
          signal: getController.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LinkScribe/1.0)'
          }
        });
        
        clearTimeout(getTimeoutId);
        
        return {
          url,
          isWorking: response.ok,
          statusCode: response.status,
          error: response.ok ? undefined : `${response.status} ${response.statusText}`,
          sourcePage
        };
      } catch (getError) {
        clearTimeout(getTimeoutId);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        throw getError;
      }
    }
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    
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
      sourcePage
    };
  }
}
