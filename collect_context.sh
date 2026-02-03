#!/bin/bash
# Project Context Loader for VoiceMux Bridge
# Combines documentation and source code for the AI agent.

OUTPUT_FILE="${1:-/tmp/voicemux_context.txt}"

{
  echo "--- PROJECT STRUCTURE ---"
  find . -maxdepth 2 -not -path '*/.*'

  echo -e "\n\n--- DOCUMENTATION & CONFIG ---"
  # Include all Markdown, JSON, and LICENSE files
  find . -maxdepth 1 \( -name "*.md" -o -name "*.json" -o -name "LICENSE" \) -not -name "package-lock.json" | sort | while read -r file;
  do
    clean_name="${file#./}"
    echo -e "\n--- FILE: $clean_name ---"
    cat "$file"
  done

  echo -e "\n\n--- SOURCE CODE ---"
  # Include JS, HTML, CSS files (excluding minified and third-party)
  find . -maxdepth 1 \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
    -not -name "*.min.js" \
    -not -name "qrcode.min.js" | sort | while read -r file;
  do
    clean_name="${file#./}"
    echo -e "\nFILE: $clean_name"
    cat "$file"
  done

} > "$OUTPUT_FILE"

echo "Context (Docs + Code) combined into $OUTPUT_FILE"

# Try to copy to clipboard
if command -v xclip &> /dev/null; then
    cat "$OUTPUT_FILE" | xclip -selection clipboard
    echo "Context copied to clipboard!"
elif command -v wl-copy &> /dev/null; then
    cat "$OUTPUT_FILE" | wl-copy
    echo "Context copied to clipboard!"
elif command -v pbcopy &> /dev/null; then
    cat "$OUTPUT_FILE" | pbcopy
    echo "Context copied to clipboard!"
fi