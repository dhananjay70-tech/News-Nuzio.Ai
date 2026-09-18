/**
 * Heuristic "AI" summarization layer.
 *
 * This is deliberately NOT a call to a hosted LLM - no API key is
 * configured for one, and fabricating a summary without a real model would
 * be worse than an honest extractive approach. It produces a real briefing
 * script (summary + key points + a "why it matters" note) from the
 * article's own text, in the article's own language, rather than raw
 * dumping the description into the player.
 *
 * The function signature (article, language, briefingLength) is the
 * integration point: swapping this internals for a real LLM call later
 * (Anthropic/OpenAI) requires no changes anywhere else in the app.
 */
export class AIService {
  /**
   * Produce a briefing script for one article.
   */
  summarizeArticle(article, language = 'en', briefingLength = 10) {
    const sourceText = article.content || article.description || article.title || '';
    const sentences = this.splitSentences(sourceText, language);

    // Longer briefings get a bit more context per story, but always stay
    // concise - a "summary" that's several long sentences of a dense news
    // article can still run past 1000 characters otherwise.
    const sentenceBudget = briefingLength <= 5 ? 2 : briefingLength <= 10 ? 3 : 4;
    const charBudget = briefingLength <= 5 ? 220 : briefingLength <= 10 ? 360 : 520;
    const summary = this.truncate(sentences.slice(0, sentenceBudget).join(' ').trim(), charBudget) || article.title;

    const keyPoints = sentences.slice(0, 3).filter(Boolean);
    const whyItMatters = this.generateWhyItMatters(article, language);

    return { summary, whyItMatters, keyPoints };
  }

  /**
   * Trim to a character budget on a word boundary, never mid-word.
   */
  truncate(text, maxChars) {
    if (!text || text.length <= maxChars) return text;
    const cut = text.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).trim()}...`;
  }

  /**
   * Split article text into sentences. Hindi text uses the "।" danda as a
   * sentence terminator (in addition to '.', '!', '?'), so a naive
   * English-only splitter would run several Hindi sentences together.
   */
  splitSentences(text, language) {
    if (!text) return [];
    const delimiter = language === 'hi' ? /(?<=[।.!?])\s+/ : /(?<=[.!?])\s+/;
    return text
      .split(delimiter)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Templated "why it matters" note, keyed by category and language.
   * Deliberately conservative in phrasing (per the no-exaggerated-claims
   * requirement) - it explains relevance, not consequences it can't verify.
   */
  generateWhyItMatters(article, language) {
    const category = article.category || 'Business';

    // Keys must match the canonical category set produced by
    // news.service.js#categorizeArticle (Tech, AI, Student, India, World,
    // Business, Startups, Sports, Science) - an unmapped category falls
    // through to the generic template below instead of silently mismatching.
    const en = {
      'Tech': 'This matters because it shows how quickly technology capabilities are moving - shifts like this often influence what tools and platforms come next.',
      'AI': 'This matters because it shows how quickly AI capabilities are advancing, which can shape the tools, products, and jobs built around it.',
      'Student': 'This matters for students and early-career professionals tracking how skills, education, and opportunities in this space are changing.',
      'Startups': 'This matters for founders and early-stage investors tracking where funding and momentum are heading in the startup ecosystem.',
      'Business': 'This matters because it reflects how a major player is adapting its strategy, which can affect competitors, partners, and customers.',
      'Science': 'This matters because it adds to the evidence base researchers and policymakers rely on for future decisions.',
      'World': 'This matters because shifts like this can affect trade, diplomacy, and policy well beyond the countries directly involved.',
      'Sports': 'This matters to fans and stakeholders following how it could affect standings, contracts, or team strategy.',
      'India': 'This matters because it reflects developments in India that can shape policy, markets, or public discussion domestically and among the diaspora.',
    };

    const hi = {
      'Tech': 'यह खबर महत्वपूर्ण है क्योंकि यह दर्शाती है कि तकनीक कितनी तेज़ी से आगे बढ़ रही है, जिसका असर आने वाले टूल्स और प्लेटफॉर्म पर पड़ सकता है।',
      'AI': 'यह खबर महत्वपूर्ण है क्योंकि यह दर्शाती है कि एआई की क्षमताएं कितनी तेज़ी से आगे बढ़ रही हैं, जिसका असर इससे बनने वाले टूल्स और नौकरियों पर पड़ सकता है।',
      'Student': 'यह खबर छात्रों और करियर की शुरुआत करने वालों के लिए महत्वपूर्ण है, क्योंकि इससे इस क्षेत्र में कौशल और अवसरों में बदलाव का पता चलता है।',
      'Startups': 'यह खबर स्टार्टअप्स से जुड़े संस्थापकों और शुरुआती निवेशकों के लिए महत्वपूर्ण है, क्योंकि इससे फंडिंग के रुझान का पता चलता है।',
      'Business': 'यह खबर महत्वपूर्ण है क्योंकि इससे पता चलता है कि एक बड़ी कंपनी अपनी रणनीति कैसे बदल रही है, जिसका असर प्रतिस्पर्धियों और ग्राहकों पर पड़ सकता है।',
      'Science': 'यह खबर महत्वपूर्ण है क्योंकि यह शोधकर्ताओं और नीति-निर्माताओं के लिए उपलब्ध जानकारी को और बढ़ाती है।',
      'World': 'यह खबर महत्वपूर्ण है क्योंकि इस तरह के बदलावों का असर व्यापार और कूटनीति पर सीधे जुड़े देशों से आगे भी पड़ सकता है।',
      'Sports': 'यह खबर उन प्रशंसकों और पक्षों के लिए महत्वपूर्ण है जो इसके नतीजों, अनुबंधों या टीम की रणनीति पर असर देख रहे हैं।',
      'India': 'यह खबर महत्वपूर्ण है क्योंकि इससे भारत में नीति, बाजार या सार्वजनिक चर्चा पर असर पड़ सकता है।',
    };

    const templates = language === 'hi' ? hi : en;
    return (
      templates[category] ||
      (language === 'hi'
        ? `यह खबर ${category} क्षेत्र में एक बड़े रुझान को दर्शाती है, जिसका असर आगे जाकर संबंधित फैसलों पर पड़ सकता है।`
        : `This is worth tracking because it reflects a broader trend in ${category.toLowerCase()} that could influence related decisions.`)
    );
  }
}

export default new AIService();
