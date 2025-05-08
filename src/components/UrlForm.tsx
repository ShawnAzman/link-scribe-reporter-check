
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface UrlFormProps {
  onSubmit: (url: string, isRecursive: boolean, maxDepth: number) => void;
  isLoading: boolean;
}

const UrlForm: React.FC<UrlFormProps> = ({ onSubmit, isLoading }) => {
  const [url, setUrl] = useState("");
  const [isRecursive, setIsRecursive] = useState(false);
  const [maxDepth, setMaxDepth] = useState(3); // Default max depth

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Simple URL validation
    let processedUrl = url.trim();
    
    if (!processedUrl) {
      toast.error("Please enter a URL");
      return;
    }

    // Add https:// if not present
    if (!/^https?:\/\//i.test(processedUrl)) {
      processedUrl = "https://" + processedUrl;
    }

    try {
      // Check if URL is valid
      new URL(processedUrl);
      onSubmit(processedUrl, isRecursive, maxDepth);
    } catch (error) {
      toast.error("Please enter a valid URL");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
          Enter a webpage URL
        </label>
        <div className="flex gap-2">
          <Input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com/article"
            className="flex-grow"
            disabled={isLoading}
            aria-describedby="url-description"
          />
          <Button 
            type="submit" 
            disabled={isLoading} 
            className="whitespace-nowrap"
          >
            {isLoading ? "Checking..." : "Check Links"}
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              id="recursive"
              type="checkbox"
              checked={isRecursive}
              onChange={(e) => setIsRecursive(e.target.checked)}
              disabled={isLoading}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="recursive" className="text-sm text-gray-700">
              Recursive (check entire site)
            </label>
          </div>
          
          {isRecursive && (
            <div className="flex items-center gap-2">
              <label htmlFor="maxDepth" className="text-sm text-gray-700">
                Max Depth:
              </label>
              <Input
                id="maxDepth"
                type="number"
                min="1"
                max="10"
                value={maxDepth}
                onChange={(e) => setMaxDepth(parseInt(e.target.value) || 3)}
                disabled={isLoading}
                className="w-16"
              />
            </div>
          )}
        </div>
        
        <p id="url-description" className="mt-2 text-sm text-gray-500">
          {isRecursive 
            ? `We'll recursively check links throughout the entire site (up to depth ${maxDepth}).`
            : "We'll check all links on this single page (no crawling)."}
        </p>
      </div>
    </form>
  );
};

export default UrlForm;
