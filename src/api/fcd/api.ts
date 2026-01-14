import { supabase } from '../../utils/supabase';
import type { FCDEntry, NewFCDEntry } from './types';

export async function fetchFCDEntries(): Promise<FCDEntry[]> {
  const { data, error } = await supabase
    .from('Pantagon_fcd')
    .select('*')
    .order('date', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function addFCDEntry(entry: NewFCDEntry): Promise<FCDEntry> {
  const { data, error } = await supabase
    .from('Pantagon_fcd')
    .insert([entry])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateFCDEntry(id: number, entry: Partial<NewFCDEntry>): Promise<FCDEntry> {
  const { data, error } = await supabase
    .from('Pantagon_fcd')
    .update(entry)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteFCDEntry(id: number): Promise<void> {
  const { error } = await supabase
    .from('Pantagon_fcd')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}
