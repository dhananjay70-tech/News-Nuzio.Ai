import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import bcrypt from 'bcryptjs';
import aiService from '../services/ai.service.js';
import * as schema from './schema.js';
import { users, newsArticles, newsSources, audioAssets, userListenHistory, savedArticles, userInterests } from './schema.js';

const client = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(client, { schema });

const DEMO_PASSWORD = 'Demo@12345';

const SEED_ARTICLES = [
  {
    title: 'Anthropic ships Claude 4.5 with 2M-token memory and native tools',
    description: 'Anthropic has officially announced Claude 4.5, boasting an unprecedented two million token context window, advanced multimodal vision analysis, and native system execution tool capabilities designed for autonomous workflows.',
    content: 'Anthropic released Claude 4.5 today, featuring a groundbreaking 2-million-token context window that enables processing of entire codebases, full-length textbooks, and complex multi-document analyses in a single conversation. The model also introduces native tool-use capabilities, allowing it to interact directly with APIs, databases, and file systems without additional orchestration layers.',
    url: 'https://theverge.com/ai/anthropic-claude-4-5',
    source: 'The Verge',
    imageUrl: null,
    category: 'AI & Tech',
    duration: 227,
    publishedAt: new Date(Date.now() - 12 * 60 * 1000),
  },
  {
    title: 'OpenAI unveils voice-first search companion integrated with live web index',
    description: 'OpenAI has expanded its real-time conversational search capabilities, allowing users to talk directly with an intelligent browsing agent that synthesizes breaking news and financial market reports on the fly.',
    content: 'OpenAI launched a new voice-first search experience that combines real-time web indexing with their GPT-5 language model. Users can now have spoken conversations about current events, receive audio summaries of breaking news, and get instant analysis of market movements. The system updates its index every 15 minutes.',
    url: 'https://techcrunch.com/openai-voice-search',
    source: 'TechCrunch',
    imageUrl: null,
    category: 'AI & Tech',
    duration: 135,
    publishedAt: new Date(Date.now() - 45 * 60 * 1000),
  },
  {
    title: 'Google DeepMind achieves breakthrough in protein-drug interaction prediction',
    description: 'DeepMind\'s AlphaFold 4 can now predict how drugs interact with proteins in real time, potentially cutting early-stage pharmaceutical research timelines by years.',
    content: 'Building on the success of AlphaFold 2 and 3, Google DeepMind has unveiled AlphaFold 4, which can model dynamic protein-ligand interactions with unprecedented accuracy. The system has already been used to identify promising drug candidates for rare genetic diseases.',
    url: 'https://nature.com/deepmind-alphafold-4',
    source: 'Nature',
    imageUrl: null,
    category: 'Science',
    duration: 304,
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  {
    title: 'Global chip manufacturing index surges 14% amid next-gen wafer demand',
    description: 'Semiconductor manufacturers report record order books as hyperscale datacenter expansion drives surging orders for three-nanometer and custom silicon designs.',
    content: 'The Philadelphia Semiconductor Index climbed 14% this quarter as demand for advanced chips continues to outpace supply. TSMC, Samsung, and Intel all reported record order backlogs, driven primarily by AI training infrastructure and autonomous vehicle computing platforms. Analysts project the trend will continue through 2027.',
    url: 'https://bloomberg.com/chip-index-surge',
    source: 'Bloomberg',
    imageUrl: null,
    category: 'Markets',
    duration: 250,
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    title: 'Seed and Series A venture deal velocities reach highest level in eighteen months',
    description: 'Early-stage technology venture financing staged an aggressive comeback this quarter, with artificial intelligence, robotics, and energy infrastructure founders closing rounds in record turnaround time.',
    content: 'PitchBook data reveals that median time-to-close for seed rounds dropped to just 21 days in Q3 2026, the fastest pace since early 2025. AI startups attracted 42% of all early-stage capital, while climate tech and robotics each saw 3x year-over-year growth in deal count.',
    url: 'https://pitchbook.com/venture-velocity-q3',
    source: 'PitchBook',
    imageUrl: null,
    category: 'Startups',
    duration: 170,
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    title: 'EU Digital Markets Act enforcement triggers major platform restructuring',
    description: 'Major tech platforms announced sweeping changes to their European operations as the EU begins levying fines under the Digital Markets Act.',
    content: 'Apple, Google, and Meta have all announced significant changes to how their platforms operate in the European Union following the first round of DMA enforcement actions. Changes include allowing alternative app stores, interoperable messaging, and unbundled default services.',
    url: 'https://reuters.com/eu-dma-enforcement',
    source: 'Reuters',
    imageUrl: null,
    category: 'Geopolitics',
    duration: 195,
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
  },
  {
    title: 'Stripe launches AI-powered revenue optimization suite for SaaS companies',
    description: 'Stripe introduced a new suite of AI tools that automatically optimize pricing, reduce churn, and forecast revenue for subscription businesses.',
    content: 'Stripe Revenue Intelligence uses machine learning trained on anonymized data from millions of subscription businesses to help SaaS companies optimize their pricing strategies, predict churn risk, and automate dunning processes. Early beta users reported an average 18% increase in net revenue retention.',
    url: 'https://techcrunch.com/stripe-ai-revenue',
    source: 'TechCrunch',
    imageUrl: null,
    category: 'Business',
    duration: 160,
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
  },
  {
    title: 'James Webb Space Telescope detects organic prebiotic molecules in distant exoplanet',
    description: 'Astronomers analyzing transmission spectra from JWST have identified unambiguous chemical biosignatures in the temperate atmosphere of a habitable-zone super-Earth.',
    content: 'A team of astronomers using the James Webb Space Telescope has detected dimethyl sulfide and phosphine — both considered potential biosignatures — in the atmosphere of K2-18b, a super-Earth located 124 light-years from our solar system. While not definitive proof of life, the findings represent the strongest evidence yet for biological processes on an exoplanet.',
    url: 'https://nature.com/jwst-biosignatures',
    source: 'Nature',
    imageUrl: null,
    category: 'Science',
    duration: 220,
    publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
  },
  {
    title: 'Premier League explores AI-generated multilingual commentary for global audiences',
    description: 'The Premier League is testing AI voice technology that generates real-time match commentary in 40 languages, aiming to reach 3 billion viewers worldwide.',
    content: 'In a groundbreaking pilot program, the English Premier League has partnered with a London-based AI startup to generate real-time match commentary in 40 different languages. The system analyzes match events, tactical patterns, and historical context to produce natural-sounding commentary that adapts to cultural preferences for each target audience.',
    url: 'https://bbc.com/sport/premier-league-ai',
    source: 'BBC Sport',
    imageUrl: null,
    category: 'Sports',
    duration: 185,
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
  },
  {
    title: 'Federal Reserve signals potential rate adjustment as inflation approaches two percent target',
    description: 'The Federal Reserve indicated it may lower interest rates at its next meeting as key inflation indicators move closer to the 2% target.',
    content: 'Federal Reserve Chair Jerome Powell said the central bank is increasingly confident that inflation is on a sustainable path toward its 2% target, opening the door to a potential 25-basis-point rate cut at the December meeting. Markets rallied on the news, with the S&P 500 hitting new all-time highs.',
    url: 'https://bloomberg.com/fed-rate-signal',
    source: 'Bloomberg',
    imageUrl: null,
    category: 'Markets',
    duration: 210,
    publishedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
  },
  {
    title: 'Y Combinator Winter 2027 batch sees record 45% AI-native startups',
    description: 'Y Combinator\'s latest batch is dominated by AI-native companies, with founders building in agentic workflows, AI infrastructure, and vertical AI applications.',
    content: 'Y Combinator announced that 45% of its Winter 2027 batch companies are AI-native, the highest proportion in the accelerator\'s history. Key themes include autonomous coding agents, AI-powered legal and compliance tools, and infrastructure for fine-tuning and deploying specialized models.',
    url: 'https://ycombinator.com/blog/w27-batch',
    source: 'Y Combinator',
    imageUrl: null,
    category: 'Startups',
    duration: 145,
    publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
  },
  {
    title: 'India overtakes Japan to become world\'s fourth-largest economy by GDP',
    description: 'India\'s GDP has officially surpassed Japan\'s, making it the world\'s fourth-largest economy behind the US, China, and Germany.',
    content: 'India\'s GDP reached $4.5 trillion in 2026, officially surpassing Japan to become the world\'s fourth-largest economy. The milestone was driven by strong growth in the technology sector, manufacturing expansion under the Make in India initiative, and a booming domestic consumer market of 1.4 billion people.',
    url: 'https://ft.com/india-gdp-overtakes-japan',
    source: 'Financial Times',
    imageUrl: null,
    category: 'Geopolitics',
    duration: 230,
    publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
];

async function main() {
  console.log('🌱 Starting Nuzio AI database seed...\n');

  // Clear existing data (children before parents, matching FK cascade order)
  console.log('   Clearing existing data...');
  await db.delete(savedArticles);
  await db.delete(userListenHistory);
  await db.delete(userInterests);
  await db.delete(audioAssets);
  await db.delete(newsSources);
  await db.delete(newsArticles);
  await db.delete(users);

  // Seed news articles - run through the same AI enrichment as live-fetched
  // articles so seed data isn't missing summary/whyItMatters.
  console.log('   Seeding news articles...');
  for (const article of SEED_ARTICLES) {
    const { summary, whyItMatters } = aiService.summarizeArticle(article, 'en', 10);
    await db.insert(newsArticles).values({ ...article, summary, whyItMatters });
  }
  console.log(`   ✅ Created ${SEED_ARTICLES.length} news articles\n`);

  // Seed a demo user
  console.log('   Seeding demo user...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [demoUser] = await db
    .insert(users)
    .values({
      name: 'Alex Morgan',
      email: 'alex.morgan@nuzio.ai',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      profession: null,
      preferredVoice: null,
      briefingLength: 10,
      updatedAt: new Date(),
    })
    .returning();
  console.log(`   ✅ Created demo user: ${demoUser.name} (${demoUser.email}, password: ${DEMO_PASSWORD})\n`);

  console.log('🎉 Seed completed successfully!\n');

  const allArticles = await db.select({ id: newsArticles.id }).from(newsArticles);
  const allUsers = await db.select({ id: users.id }).from(users);
  console.log(`   📊 Database stats:`);
  console.log(`      Users: ${allUsers.length}`);
  console.log(`      Articles: ${allArticles.length}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
