#!/bin/bash

# Configuration: Project-specific extensions
EXTENSIONS="js,jsx,ts,tsx,kt,ex,exs,svelte,html,css,dart,go"
COMMENT_LIMIT=3

echo "# Codebase Map (Enhanced with Intent)"
echo "This map provides a structural overview with documentation comments. For implementation details, use MCP."
echo ""

# Get relevant files from git, excluding minified ones
FILES=$(git ls-files | grep -E "\.(${EXTENSIONS//,/|})$" | grep -v "\.min\.js$")

if [ -z "$FILES" ]; then
    # Fallback to all files if not in a git repo or no files found
    FILES=$(find . -maxdepth 3 -type f | grep -E "\.(${EXTENSIONS//,/|})$" | grep -v "\.min\.js$")
fi

if [ -z "$FILES" ]; then
    echo "No files found with extensions: $EXTENSIONS"
    exit 0
fi

# Run ctags and process output
# Using jq to format output as tab-separated values to avoid multiple jq calls in the loop
echo "$FILES" | xargs ctags --output-format=json --fields=+n+S --sort=no 2>/dev/null | jq -r -s '
    sort_by(.path) | .[] | 
    "\(.path)\t\(.name)\t\(.kind)\t\(.line)\t\(.signature // "")"
' | while IFS=$'\t' read -r PATH_VAL NAME KIND LINE_NUM SIG; do
    # Group by file
    if [ "$CURRENT_PATH" != "$PATH_VAL" ]; then
        echo -e "\n### FILE: $PATH_VAL"
        CURRENT_PATH=$PATH_VAL
    fi

    # Extract comments directly before the definition
    if [ -f "$PATH_VAL" ]; then
        # Faster comment extraction: head | tail | grep sequence
        COMMENTS=$(head -n $((LINE_NUM - 1)) "$PATH_VAL" 2>/dev/null | tail -n $COMMENT_LIMIT | grep -E "^\s*(//|/\*|\*|#|@doc|--)" | sed 's/^[[:space:]]*//' | tr '\n' ' ' | sed 's/ $//')
        
        if [ -n "$COMMENTS" ]; then
            echo "  [$KIND] $NAME$SIG (Line: $LINE_NUM) // $COMMENTS"
        else
            echo "  [$KIND] $NAME$SIG (Line: $LINE_NUM)"
        fi
    fi
done
