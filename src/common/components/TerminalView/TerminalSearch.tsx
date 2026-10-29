import { useEffect, useRef, useState } from "react";
import { cn } from "@utils/cn";
import {
  VscArrowDown,
  VscArrowUp,
  VscCaseSensitive,
  VscClose,
  VscRegex,
  VscWholeWord,
} from "react-icons/vsc";
import { clearTerminalSearch, focusTerminal, getSearchAddon } from "./engine";

const SEARCH_DECORATIONS = {
  matchBackground: "#4d3800",
  matchBorder: "#886716",
  matchOverviewRuler: "#886716",
  activeMatchBackground: "#174e7c",
  activeMatchBorder: "#2a75d3",
  activeMatchColorOverviewRuler: "#2a75d3",
};

export default function TerminalSearch({
  termId,
  onClose,
}: {
  termId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [resultIndex, setResultIndex] = useState(-1);
  const [resultCount, setResultCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const search = getSearchAddon(termId);
    if (!search) return;
    const disp = search.onDidChangeResults((e) => {
      setResultIndex(e.resultIndex);
      setResultCount(e.resultCount);
    });
    return () => {
      disp.dispose();
    };
  }, [termId]);

  const doSearch = (
    text: string,
    direction: "next" | "prev" = "next",
    opts = { caseSensitive, wholeWord, regex }
  ) => {
    const search = getSearchAddon(termId);
    if (!search) return;
    if (!text) {
      search.clearDecorations();
      setResultIndex(-1);
      setResultCount(0);
      return;
    }
    const options = {
      caseSensitive: opts.caseSensitive,
      wholeWord: opts.wholeWord,
      regex: opts.regex,
      decorations: SEARCH_DECORATIONS,
    };
    try {
      if (direction === "next") {
        search.findNext(text, options);
      } else {
        search.findPrevious(text, options);
      }
    } catch {
      setResultCount(0);
      setResultIndex(-1);
    }
  };

  const handleChange = (val: string) => {
    setQuery(val);
    doSearch(val, "next");
  };

  const handleNext = () => doSearch(query, "next");
  const handlePrev = () => doSearch(query, "prev");

  const handleClose = () => {
    clearTerminalSearch(termId);
    onClose();
    focusTerminal(termId);
  };

  const toggleCase = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    doSearch(query, "next", { caseSensitive: next, wholeWord, regex });
  };

  const toggleWord = () => {
    const next = !wholeWord;
    setWholeWord(next);
    doSearch(query, "next", { caseSensitive, wholeWord: next, regex });
  };

  const toggleRegex = () => {
    const next = !regex;
    setRegex(next);
    doSearch(query, "next", { caseSensitive, wholeWord, regex: next });
  };

  return (
    <div className="vd-pop absolute top-2 right-4 z-20 flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur-xs">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) handlePrev();
              else handleNext();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleClose();
            }
          }}
          placeholder="Find"
          className="h-6.5 w-44 rounded bg-zinc-950 px-2 pr-14 text-xs text-zinc-100 placeholder-zinc-500 outline-none ring-1 ring-zinc-700 focus:ring-sky-600"
        />
        {query && (
          <span className="pointer-events-none absolute right-1.5 text-[10px] text-zinc-400 select-none">
            {resultCount > 0 ? `${resultIndex + 1} of ${resultCount}` : "No results"}
          </span>
        )}
      </div>

      <button
        onClick={toggleCase}
        title="Match Case (Alt+C)"
        className={cn(
          "rounded p-1 text-xs",
          caseSensitive
            ? "bg-sky-600/30 text-sky-400 ring-1 ring-sky-500/50"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        )}
      >
        <VscCaseSensitive size={14} />
      </button>

      <button
        onClick={toggleWord}
        title="Match Whole Word (Alt+W)"
        className={cn(
          "rounded p-1 text-xs",
          wholeWord
            ? "bg-sky-600/30 text-sky-400 ring-1 ring-sky-500/50"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        )}
      >
        <VscWholeWord size={14} />
      </button>

      <button
        onClick={toggleRegex}
        title="Use Regular Expression (Alt+R)"
        className={cn(
          "rounded p-1 text-xs",
          regex
            ? "bg-sky-600/30 text-sky-400 ring-1 ring-sky-500/50"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        )}
      >
        <VscRegex size={14} />
      </button>

      <div className="mx-0.5 h-4 w-px bg-zinc-700" />

      <button
        onClick={handlePrev}
        disabled={!query || resultCount === 0}
        title="Previous Match (Shift+Enter)"
        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
      >
        <VscArrowUp size={14} />
      </button>

      <button
        onClick={handleNext}
        disabled={!query || resultCount === 0}
        title="Next Match (Enter)"
        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
      >
        <VscArrowDown size={14} />
      </button>

      <button
        onClick={handleClose}
        title="Close (Escape)"
        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      >
        <VscClose size={14} />
      </button>
    </div>
  );
}
