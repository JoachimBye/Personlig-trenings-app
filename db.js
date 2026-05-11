// ============================================================
// Database-funksjoner mot Supabase
// ============================================================

if (!SUPABASE_URL || SUPABASE_URL === 'https://hfqgrcwboeklcxccqslj.supabase.co' ||
    !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmcWdyY3dib2VrbGN4Y2Nxc2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0ODEzNzMsImV4cCI6MjA5NDA1NzM3M30.-YpNN2xnnHtEOYGqXG8j4NIpX5ByFapeojcEW9s-Y9k') {
  document.body.innerHTML = `
    <div style="padding:40px 24px;font-family:sans-serif;color:#fff;background:#0d0d0d;height:100vh">
      <h1 style="margin-bottom:16px">Oppsett mangler</h1>
      <p style="margin-bottom:8px">Du må fylle inn Supabase-detaljer i <code>config.js</code> før appen kan kjøre.</p>
      <p style="color:#aaa">Se <code>README.md</code> for steg-for-steg.</p>
    </div>`;
  throw new Error('Supabase er ikke konfigurert');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const db = {

  // ---------- Programmer ----------
  async getPrograms() {
    const { data, error } = await sb
      .from('programs')
      .select('*, exercises(count)')
      .order('sort_order')
      .order('created_at');
    if (error) throw error;
    return data.map(p => ({
      ...p,
      exercise_count: p.exercises[0]?.count || 0,
    }));
  },

  async addProgram(name) {
    const { data, error } = await sb
      .from('programs')
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteProgram(id) {
    const { error } = await sb.from('programs').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- Øvelser ----------
  async getExercises(programId) {
    const { data: exercises, error } = await sb
      .from('exercises')
      .select('*')
      .eq('program_id', programId)
      .order('sort_order')
      .order('created_at');
    if (error) throw error;
    if (exercises.length === 0) return [];

    // Hent siste logg-tidspunkt for hver øvelse (én ekstra query, ikke N+1)
    const ids = exercises.map(e => e.id);
    const { data: sets } = await sb
      .from('sets')
      .select('exercise_id, logged_at')
      .in('exercise_id', ids)
      .order('logged_at', { ascending: false });

    const lastMap = {};
    for (const s of sets || []) {
      if (!lastMap[s.exercise_id]) lastMap[s.exercise_id] = s.logged_at;
    }

    return exercises.map(e => ({
      ...e,
      last_logged_at: lastMap[e.id] || null,
    }));
  },

  async addExercise(programId, name) {
    const { data, error } = await sb
      .from('exercises')
      .insert({ program_id: programId, name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteExercise(id) {
    const { error } = await sb.from('exercises').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- Sett ----------
  async getSets(exerciseId, limit = 100) {
    const { data, error } = await sb
      .from('sets')
      .select('*')
      .eq('exercise_id', exerciseId)
      .order('logged_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async addSet(exerciseId, reps, weightKg, isWarmup) {
    const { data, error } = await sb
      .from('sets')
      .insert({
        exercise_id: exerciseId,
        reps:        reps,
        weight_kg:   weightKg,
        is_warmup:   isWarmup,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteSet(id) {
    const { error } = await sb.from('sets').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- Uke-aktivitet ----------
  async getWeekActivity(weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const { data, error } = await sb
      .from('sets')
      .select('logged_at, exercise_id, exercises(name, programs(name))')
      .gte('logged_at', weekStart.toISOString())
      .lt('logged_at', weekEnd.toISOString())
      .order('logged_at');
    if (error) throw error;
    return data;
  },
};
