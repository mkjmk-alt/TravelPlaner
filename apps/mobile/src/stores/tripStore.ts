import { create } from 'zustand';
import { Trip, ItineraryItem, Expense } from '../types';
import { supabase } from '../lib/supabase';

interface TripState {
  trips: Trip[];
  loading: boolean;
  activeTrip: Trip | null;
  
  fetchTrips: () => Promise<void>;
  addTrip: (trip: Omit<Trip, 'id' | 'updatedAt' | 'ownerId'>) => Promise<void>;
  updateTrip: (id: string, updates: Partial<Trip>) => Promise<void>;
  deleteTrip: (id: string) => Promise<void>;
  setActiveTrip: (trip: Trip | null) => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  loading: false,
  activeTrip: null,

  fetchTrips: async () => {
    set({ loading: true });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      // 게스트 모드: 초기 로딩 완료 처리만 함 (기존 로컬 데이터가 있다면 유지)
      set({ loading: false });
      return;
    }

    // user_state 테이블에서 world_pro_trips_v1 키로 저장된 데이터를 가져옵니다 (웹앱과 동일)
    const { data, error } = await supabase
      .from('user_state')
      .select('state_data')
      .eq('user_id', user.id)
      .eq('state_key', 'world_pro_trips_v1')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching trips:', error);
    } else if (data) {
      set({ trips: data.state_data || [] });
    }
    set({ loading: false });
  },

  addTrip: async (newTripData) => {
    const { data: { user } } = await supabase.auth.getUser();

    const newTrip: Trip = {
      ...newTripData,
      id: Math.random().toString(36).substr(2, 9),
      ownerId: user?.id || 'guest',
      updatedAt: new Date().toISOString(),
    };

    const updatedTrips = [...get().trips, newTrip];
    
    // 로컬 상태 업데이트
    set({ trips: updatedTrips });

    // Supabase 동기화 (로그인한 사용자만)
    if (user) {
      await supabase.from('user_state').upsert({
        user_id: user.id,
        state_key: 'world_pro_trips_v1',
        state_data: updatedTrips,
        updated_at: new Date().toISOString(),
      });
    }
  },

  setActiveTrip: (trip) => set({ activeTrip: trip }),

  updateTrip: async (id, updates) => {
    const updatedTrips = get().trips.map(t => 
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    );
    set({ trips: updatedTrips });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_state').upsert({
        user_id: user.id,
        state_key: 'world_pro_trips_v1',
        state_data: updatedTrips,
        updated_at: new Date().toISOString(),
      });
    }
  },

  deleteTrip: async (id) => {
    const updatedTrips = get().trips.filter(t => t.id !== id);
    set({ trips: updatedTrips });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_state').upsert({
        user_id: user.id,
        state_key: 'world_pro_trips_v1',
        state_data: updatedTrips,
        updated_at: new Date().toISOString(),
      });
    }
  },
}));
