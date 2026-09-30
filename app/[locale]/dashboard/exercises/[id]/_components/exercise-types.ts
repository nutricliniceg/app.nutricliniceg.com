export interface EditExercise {
  clientId: string;
  id?: string;
  name_ar: string;
  name_en?: string | null;
  sets: number;
  reps: number;
  rest_seconds?: number | null;
  youtube_url?: string | null;
  notes?: string | null;
}

export interface EditDay {
  day: number;
  exercises: EditExercise[];
}

export function newExercise(): EditExercise {
  return {
    clientId: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name_ar: '',
    sets: 3,
    reps: 12,
    rest_seconds: 60,
    youtube_url: null,
    notes: null,
  };
}
