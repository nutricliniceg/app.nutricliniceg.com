export interface TemplateCardData {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  is_global: boolean;
  reference_calories: number | null;
  usage_count: number;
}
