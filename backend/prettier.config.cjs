/** @type {import('prettier').Config} */
module.exports = {
    semi: true, // Add semicolons
    singleQuote: true, // Use single quotes
    tabWidth: 4, // Use 4 spaces per indentation level
    useTabs: false, // Use spaces instead of tabs
    trailingComma: 'all', // Add trailing commas wherever possible (better Git diffs)
    printWidth: 100, // Wrap lines at 100 characters
    bracketSpacing: true, // Add spaces between brackets in object literals
    arrowParens: 'always', // Always include parentheses around arrow function arguments
    endOfLine: 'lf', // Use LF (Unix-style) line endings
};
