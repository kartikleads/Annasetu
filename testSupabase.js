import { supabase } from "./supabase.js";

export async function testSupabase() {
  if (!supabase) {
    console.log("Supabase client not configured; operating in local mode.");
    return;
  }
  const { data, error } = await supabase
    .from("food_listings")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Supabase connection test:", error.message);
    return;
  }

  console.log("Supabase connected. Rows returned:", data.length);
}
