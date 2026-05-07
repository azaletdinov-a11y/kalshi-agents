import axios from 'axios';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

export async function searchTavily(query: string): Promise<string> {
  const res = await axios.post<TavilyResponse>(
    'https://api.tavily.com/search',
    {
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      max_results: 5,
      include_answer: true,
    }
  );

  const { results, answer } = res.data;

  const parts: string[] = [];
  if (answer) parts.push(`Summary: ${answer}`);

  results.forEach((r, i) => {
    const date = r.published_date ? ` (${r.published_date})` : '';
    parts.push(`[${i + 1}] ${r.title}${date}\n${r.content}`);
  });

  return parts.join('\n\n');
}
