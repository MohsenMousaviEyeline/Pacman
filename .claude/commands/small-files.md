---
description: List all source files in the project that are smaller than 300 lines of code (excludes node_modules, dist, .git)
subagent_type: Explore
---

Search the codebase at the current working directory and list every source file (TypeScript, TSX, JavaScript, CSS, HTML, JSON, config files, etc.) that has **fewer than 300 lines of code**.

Exclude these directories entirely: `node_modules`, `dist`, `.git`, `html/assets`.

For each qualifying file report:
- The relative file path from the project root
- The exact line count

Sort results by line count ascending. Present the output as a markdown table with columns: **File** and **Lines**.

After the table, show a brief summary:
- Total number of files under 300 lines
- Which files are closest to the 300-line limit (top 3)
- Which files exceed 300 lines (list them with their counts so the user knows what was excluded)
