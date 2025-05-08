
import { useState, useRef } from "react";
import UrlForm from "@/components/UrlForm";
import ResultsTable from "@/components/ResultsTable";
import StatusBanner from "@/components/StatusBanner";
import { LinkCheckResult } from "@/types/linkTypes";
import { checkLinks } from "@/services/linkChecker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowDown, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

const Index = () => {
  const [results, setResults] = useState<LinkCheckResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRecursive, setIsRecursive] = useState(false);
  const [maxDepth, setMaxDepth] = useState(3);
  const [checkedPages, setCheckedPages] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSubmit = async (submittedUrl: string, recursive: boolean, depth: number) => {
    if (!submittedUrl) return;

    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create a new abort controller
      abortControllerRef.current = new AbortController();
      
      setIsChecking(true);
      setHasChecked(false);
      setError(null);
      setUrl(submittedUrl);
      setResults([]);
      setIsRecursive(recursive);
      setMaxDepth(depth);
      setCheckedPages(0);
      
      // Start the link checking process
      const data = await checkLinks(
        submittedUrl, 
        recursive, 
        depth, 
        (newResults) => {
          setResults(prevResults => [...prevResults, ...newResults]);
        },
        (pageCount) => {
          setCheckedPages(pageCount);
        },
        abortControllerRef.current.signal
      );
      
      setResults(data);
      setHasChecked(true);
      
      // Success toasts are handled inside checkLinks function
    } catch (error) {
      console.error("Error checking links:", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        setError("Link checking was cancelled.");
        toast.info("Link checking was cancelled.");
      } else {
        setError(error instanceof Error ? error.message : 'Something went wrong while checking links.');
        toast.error(`Error checking links: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      setHasChecked(true);
    } finally {
      setIsChecking(false);
      abortControllerRef.current = null;
    }
  };

  const downloadCsv = () => {
    if (results.length === 0) return;
    
    // Create CSV content
    const headers = ["URL", "Status", "Status Code", "Error"];
    const csvRows = [
      headers.join(","),
      ...results.map(result => {
        const status = result.isWorking ? "Working" : "Broken";
        const statusCode = result.statusCode || "";
        const error = result.error ? `"${result.error.replace(/"/g, '""')}"` : "";
        return [result.url, status, statusCode, error].join(",");
      })
    ];
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    
    // Create download link and trigger download
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `link-check-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("CSV file downloaded successfully!");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 px-4">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Link Scribe</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Check for broken links on any webpage. Simply enter a URL to verify all links are working properly.
          </p>
        </header>

        <Card className="p-6 mb-6 max-w-3xl mx-auto">
          <UrlForm onSubmit={handleSubmit} isLoading={isChecking} />
          
          {isChecking && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => abortControllerRef.current?.abort()} className="text-red-600">
                Cancel Check
              </Button>
            </div>
          )}
        </Card>

        {error && hasChecked && (
          <Alert variant="destructive" className="mb-6 max-w-3xl mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error checking links</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {hasChecked && !error && (
          <>
            <StatusBanner results={results} url={url} checkedPages={checkedPages} isRecursive={isRecursive} />

            {results.length > 0 && (
              <div className="my-6 max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">Results</h2>
                  <Button 
                    onClick={downloadCsv} 
                    variant="outline" 
                    className="flex items-center gap-2"
                  >
                    <ArrowDown className="h-4 w-4" />
                    Download CSV
                  </Button>
                </div>
                
                <ResultsTable results={results} isRecursive={isRecursive} />
              </div>
            )}
          </>
        )}
        
        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>Made for journalists and content creators</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
