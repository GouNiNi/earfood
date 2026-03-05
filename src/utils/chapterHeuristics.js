export function detectChapters(text) {
    const chapters = [];

    // This regex matches typical chapter headings on their own line.
    // 1. Explicit labels: "Chapitre 1", "Partie II", "Book 3"
    // 2. Structural keywords: "Introduction", "Conclusion"
    // 3. Standalone roman numerals or numbers
    // 4. Short all-caps sentences (under 50 chars) heavily used in some PDFs for chapter titles
    const regex = /^[ \t]*((?:chapitre|chapter|partie|part|livre|book)[ \t]+(?:[0-9]+|[IVXLCDM]+)(?:[ \t]*[:\.-][ \t]*(?:.*))?|(?:introduction|conclusion|prologue|epilogue|preface|postface)|(?:[IVXLCDM]{1,7}|[0-9]{1,3})|[A-ZÀ-Ÿ\s\-']{3,50})[ \t]*$/gmi;

    let match;
    while ((match = regex.exec(text)) !== null) {
        let title = match[0].trim();
        const start = match.index;
        const isStandaloneNumberOrNumeral = !!match[4];

        // If it's a standalone number, verify it's not just a page number.
        // By checking if the text around it has sufficient spacing (like paragraph breaks).
        if (isStandaloneNumberOrNumeral) {
            // Look at the character just before the line (if any) and just after
            const charBefore = start > 0 ? text[start - 1] : '\n';
            const endOfLine = start + match[0].length;
            const charAfter = endOfLine < text.length ? text[endOfLine] : '\n';

            // Page numbers are often preceded or followed by standard text without double newlines.
            // We ensure there's at least some spacing (e.g. \n\n) around standalone numbers to consider them chapters.
            // For simplicity, we'll keep them if they are roman numerals which are less likely page numbers,
            // but regular numbers look suspicious unless heavily spaced. Let's keep them and filter later if there's too many.
        }

        const isOnlyNumber = /^[0-9]+$/.test(title);

        // Exclude purely uppercase strings that are likely just paragraphs (e.g. over 60 chars)
        if (title.length > 60 && /^[A-ZÀ-Ÿ\s\-']+$/.test(title)) continue;

        // Skip tiny non-chapter-like words that might match uppercase by accident
        if (title.length < 3 && !isOnlyNumber && !/^[IVXLCDM]+$/.test(title)) continue;

        // Deduplicate chapters that are extremely close to each other (e.g. "Chapitre 1", then next line "Introduction")
        // Require at least 50 characters of content between chapters.
        if (chapters.length === 0 || (start - chapters[chapters.length - 1].start > 50)) {
            chapters.push({
                title: title.substring(0, 50).trim() + (title.length > 50 ? '...' : ''),
                start: start
            });
        }
    }

    if (chapters.length === 0) return undefined;

    // Calculate ends ensuring no gaps
    for (let j = 0; j < chapters.length; j++) {
        chapters[j].end = j < chapters.length - 1 ? chapters[j + 1].start : text.length;
    }

    // Final filtering: remove standalone numbers if they proved to be just page numbers (e.g., hundreds of them)
    const isMostlyStandaloneNumbers = chapters.filter(c => /^[0-9]+$/.test(c.title)).length > 20;

    let validChapters = chapters;
    if (isMostlyStandaloneNumbers) {
        // Likely caught page numbers. Filter out the standalone numeric-only titles.
        validChapters = chapters.filter(c => !/^[0-9]+$/.test(c.title));
    }

    if (validChapters.length === 0) return undefined;

    // Re-calculate ends if we filtered some out
    for (let j = 0; j < validChapters.length; j++) {
        validChapters[j].end = j < validChapters.length - 1 ? validChapters[j + 1].start : text.length;
    }

    return validChapters;
}
