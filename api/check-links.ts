
import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const config = {
  runtime: "edge",
};

export default async function handler(req: NextRequest) {
  try {
    const url = new URL(req.url).searchParams.get("url");
    
    if (!url) {
      return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });
    }

    // Fetch the target page
    const pageResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 Link Checker (compatible; Link-Scribe/1.0)",
      },
    });

    if (!pageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch the URL: ${pageResponse.status} ${pageResponse.statusText}` }, 
        { status: 400 }
      );
    }

    const html = await pageResponse.text();
    
    // Parse HTML and extract links
    const $ = cheerio.load(html);
    const links: string[] = [];
    
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        try {
          // Resolve relative URLs
          const resolvedUrl = new URL(href, url).toString();
          links.push(resolvedUrl);
        } catch (e) {
          console.error(`Error resolving URL ${href}:`, e);
        }
      }
    });

    // Deduplicate links
    const uniqueLinks = [...new Set(links)];
    
    // Check each link (limiting concurrency to 5)
    const results = await checkLinksInBatches(uniqueLinks, 5);
    
    return NextResponse.json({ results });
    
  } catch (error) {
    console.error("Error checking links:", error);
    return NextResponse.json(
      { error: `Failed to check links: ${error instanceof Error ? error.message : String(error)}` }, 
      { status: 500 }
    );
  }
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
