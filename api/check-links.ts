
// Use native fetch API for serverless edge function
export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url).searchParams.get("url");
    
    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL parameter is required" }),
        { 
          status: 400,
          headers: { "content-type": "application/json" }
        }
      );
    }

    // Fetch the target page
    const pageResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 Link Checker (compatible; Link-Scribe/1.0)",
      },
    });

    if (!pageResponse.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch the URL: ${pageResponse.status} ${pageResponse.statusText}` 
        }),
        { 
          status: 400,
          headers: { "content-type": "application/json" }
        }
      );
    }

    const html = await pageResponse.text();
    
    // Parse HTML and extract links
    const links = extractLinks(html, url);
    
    // Deduplicate links
    const uniqueLinks = [...new Set(links)];
    
    // Check each link (limiting concurrency to 5)
    const results = await checkLinksInBatches(uniqueLinks, 5);
    
    // Return proper JSON
    return new Response(
      JSON.stringify({ results }),
      { 
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error checking links:", error);
    return new Response(
      JSON.stringify({ error: `Failed to check links: ${error instanceof Error ? error.message : String(error)}` }),
      { 
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
  }
}

// Extract links from HTML without using cheerio
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
        const resolvedUrl = new URL(href, baseUrl).toString();
        links.push(resolvedUrl);
      }
    } catch (e) {
      console.error(`Error resolving URL:`, e);
    }
  }

  return links;
}

async function checkLinksInBatches(links: string[], batchSize: number) {
  const results = [];
  
  // Process links in batches to limit concurrency
  for (let i = 0; i < links.length; i += batchSize) {
    const batch = links.slice(i, i + batchSize);
    const batchPromises = batch.map(checkSingleLink);
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

async function checkSingleLink(url: string) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      method: "HEAD", // Try HEAD first
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 Link Checker (compatible; Link-Scribe/1.0)",
      },
    }).catch(async () => {
      // If HEAD fails, try GET instead (some servers don't support HEAD)
      return fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 Link Checker (compatible; Link-Scribe/1.0)",
        },
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
