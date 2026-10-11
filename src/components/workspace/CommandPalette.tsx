import { File } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { searchFiles } from "@/lib/workspace/model";
import { useWorkspace } from "./WorkspaceContext";

/** Ctrl/⌘+K: jump to any file by name, path or exported symbol. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { index, select } = useWorkspace();
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  const results = useMemo(() => searchFiles(index, query, 12), [index, query]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Go to file</DialogTitle>
        <DialogDescription className="sr-only">
          Search files by name, path or exported symbol.
        </DialogDescription>
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Go to file or export…"
          />
          <CommandList>
            {query.trim() && results.length === 0 && (
              <CommandEmpty>No file or export matches.</CommandEmpty>
            )}
            {!query.trim() && (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                Type a file name, path or export.
              </p>
            )}
            {results.map((result) => (
              <CommandItem
                key={result.path}
                value={result.path}
                onSelect={() => {
                  select(result.path);
                  onOpenChange(false);
                }}
              >
                <File className="text-subtle mr-2 size-4" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate">{result.path.split("/").pop()}</span>
                  <span className="text-subtle block truncate font-mono text-xs">
                    {result.path}
                    {result.match ? ` · exports ${result.match}` : ""}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
