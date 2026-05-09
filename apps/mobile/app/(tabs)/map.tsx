import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TextInput, TouchableOpacity,
  Animated, PanResponder, ScrollView, Platform, Modal, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import { Colors } from '../../src/theme/colors';
import { useTripStore } from '../../src/stores/tripStore';
import { 
  Search, MapPin, Calendar, Clock, Plus, ChevronUp, ChevronDown, 
  Trash2, Navigation, Sparkles, Brain, Wallet, AlertCircle, 
  CheckCircle2, Plane, Heart, Share2, Users, Check, Edit2, 
  PlusCircle, ChevronRight, X
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyzeTripWithAI, AIAnalysisResult } from '../../src/lib/gemini';

const { width, height } = Dimensions.get('window');

// Bottom sheet snap positions
const SNAP_BOTTOM = height * 0.12;   
const SNAP_MIDDLE = height * 0.50;   
const SNAP_TOP    = height * 0.92;   

const MAP_STYLE = [
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#eff6ff' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f3f4f6' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#f9fafb' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 15 }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff', weight: 3 }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 10 }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] }
];

export default function MapScreen() {
  const { trips, activeTrip, fetchTrips, setActiveTrip, deleteTrip } = useTripStore();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // View Control
  const [viewMode, setViewMode] = useState<'trips' | 'favorites' | 'itinerary' | 'budget'>('trips');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const displayTrip = activeTrip || (trips.length > 0 ? trips[0] : null);

  const [region, setRegion] = useState({
    latitude: 37.5665,
    longitude: 126.9780,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<AIAnalysisResult | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);

  // ---- Custom Bottom Sheet (Animated API) ----
  const sheetHeight = useRef(new Animated.Value(SNAP_MIDDLE)).current;
  const lastSnap = useRef(SNAP_MIDDLE);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 10,
      onPanResponderGrant: () => {
        sheetHeight.setOffset(lastSnap.current);
        sheetHeight.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        sheetHeight.setValue(-gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        sheetHeight.flattenOffset();
        const currentVal = lastSnap.current + (-gestureState.dy);
        const velocity = -gestureState.vy;

        let targetSnap: number;
        if (velocity > 0.5) {
          targetSnap = currentVal < SNAP_MIDDLE ? SNAP_MIDDLE : SNAP_TOP;
        } else if (velocity < -0.5) {
          targetSnap = currentVal > SNAP_MIDDLE ? SNAP_MIDDLE : SNAP_BOTTOM;
        } else {
          const diffs = [
            { snap: SNAP_BOTTOM, diff: Math.abs(currentVal - SNAP_BOTTOM) },
            { snap: SNAP_MIDDLE, diff: Math.abs(currentVal - SNAP_MIDDLE) },
            { snap: SNAP_TOP, diff: Math.abs(currentVal - SNAP_TOP) },
          ];
          diffs.sort((a, b) => a.diff - b.diff);
          targetSnap = diffs[0].snap;
        }

        lastSnap.current = targetSnap;
        Animated.spring(sheetHeight, {
          toValue: targetSnap,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    fetchTrips();
  }, []);

  useEffect(() => {
    if (displayTrip?.itinerary && displayTrip.itinerary.length > 0) {
      for (const day of displayTrip.itinerary) {
        const items = day.items || [];
        const firstPlace = items.find((item: any) => item.lat && item.lng);
        if (firstPlace) {
          setRegion({
            latitude: Number(firstPlace.lat),
            longitude: Number(firstPlace.lng),
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });
          break;
        }
      }
    }
    // If active trip changes, switch to itinerary view
    if (activeTrip) {
      setViewMode('itinerary');
      // Snap to middle if currently at bottom
      if (lastSnap.current === SNAP_BOTTOM) {
        lastSnap.current = SNAP_MIDDLE;
        Animated.spring(sheetHeight, { toValue: SNAP_MIDDLE, useNativeDriver: false }).start();
      }
    }
  }, [activeTrip?.id]);

  const handleAIAnalysis = async () => {
    if (!displayTrip) return;
    setIsAnalyzing(true);
    setShowAIModal(true);
    try {
      const totalSpent = (displayTrip.expenses || []).reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);
      const budgetLimit = displayTrip.budget || 1000000;
      const report = await analyzeTripWithAI(displayTrip, totalSpent, budgetLimit);
      setAiReport(report);
    } catch (error) {
      console.error(error);
      alert('AI 분석에 실패했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Markers & Polyline
  const allMarkers = displayTrip?.itinerary?.flatMap((day: any) =>
    (day.items || []).filter((item: any) => item.lat && item.lng).map((item: any, idx: number) => ({
      ...item,
      dayNum: day.day,
      index: idx,
    }))
  ) || [];

  const [activeDay, setActiveDay] = useState(1);
  const currentDayPlan = displayTrip?.itinerary?.find((d: any) => {
    const dayNum = parseInt(String(d.day).replace(/[^0-9]/g, '')) || 0;
    return dayNum === activeDay;
  });

  const polylinePath = (currentDayPlan?.items || [])
    .filter((item: any) => item.lat && item.lng)
    .map((item: any) => ({
      latitude: Number(item.lat),
      longitude: Number(item.lng),
    }));

  const focusOnPlace = (item: any) => {
    if (item.lat && item.lng && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: Number(item.lat),
        longitude: Number(item.lng),
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  // --- Sub-Views (Web Parity) ---

  const renderTripsView = () => (
    <View style={styles.viewContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitleLabel}>My Trips</Text>
        <TouchableOpacity style={styles.inlineActionBtn}>
          <PlusCircle size={14} color={Colors.secondary} />
          <Text style={styles.inlineActionText}>NEW TRIP</Text>
        </TouchableOpacity>
      </View>

      {trips.length === 0 ? (
        <View style={styles.emptyCard}>
          <Plane size={48} color={Colors.border.medium} />
          <Text style={styles.emptyCardText}>No trips planned yet</Text>
        </View>
      ) : (
        trips.map(trip => (
          <TouchableOpacity 
            key={trip.id} 
            style={[styles.tripCard, activeTrip?.id === trip.id && styles.tripCardActive]}
            onPress={() => setActiveTrip(trip)}
          >
            <View style={styles.tripCardHeader}>
              <Text style={styles.tripCardTitle} numberOfLines={1}>{trip.name}</Text>
              <View style={styles.tripCardActions}>
                <TouchableOpacity style={styles.tripActionIcon}>
                  <Share2 size={16} color={Colors.text.secondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.tripActionIcon} onPress={() => deleteTrip(trip.id)}>
                  <Trash2 size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.tripCardInfoRow}>
              <View style={styles.infoItem}>
                <Calendar size={12} color={Colors.text.muted} />
                <Text style={styles.infoItemText}>{trip.startDate || 'No date'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Wallet size={12} color={Colors.text.muted} />
                <Text style={styles.infoItemText}>₩{((trip.expenses || []).reduce((s:any, e:any) => s + (e.amountKRW || 0), 0)).toLocaleString()}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  const renderFavoritesView = () => (
    <View style={styles.viewContainer}>
      <Text style={styles.sectionTitleLabel}>Saved Places</Text>
      <View style={styles.emptyCard}>
        <Heart size={48} color={Colors.danger} />
        <Text style={styles.emptyCardText}>No places saved yet</Text>
      </View>
    </View>
  );

  const renderItineraryView = () => (
    <View style={styles.viewContainer}>
      <View style={styles.tripHeader}>
        <Text style={styles.tripTitleLarge}>{displayTrip?.name}</Text>
        <View style={styles.dateRow}>
          <Calendar size={13} color={Colors.text.secondary} />
          <Text style={styles.dateText}>
            {displayTrip?.startDate || '날짜 미정'} ~ {displayTrip?.endDate || ''}
          </Text>
        </View>
      </View>

      {/* Day Selector */}
      {displayTrip?.itinerary && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daySelector}>
          {displayTrip.itinerary.map((day: any, idx: number) => {
            const dayNum = parseInt(String(day.day).replace(/[^0-9]/g, '')) || (idx + 1);
            const isActive = dayNum === activeDay;
            return (
              <TouchableOpacity
                key={`day-${dayNum}`}
                style={[styles.dayChip, isActive && styles.dayChipActive]}
                onPress={() => setActiveDay(dayNum)}
              >
                <Text style={[styles.dayChipText, isActive && styles.dayChipTextActive]}>Day {dayNum}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Itinerary List */}
      {(!currentDayPlan || (currentDayPlan.items || []).length === 0) ? (
        <View style={styles.emptyDayPlaceholder}>
          <Text style={styles.emptyDayText}>해당 일의 일정이 비어 있습니다.</Text>
        </View>
      ) : (
        currentDayPlan.items.map((item: any, index: number) => (
          <TouchableOpacity key={item.id || index} style={styles.itineraryItem} onPress={() => focusOnPlace(item)}>
            <View style={styles.timelineContainer}>
              <View style={styles.timelineDot} />
              {index < currentDayPlan.items.length - 1 && <View style={styles.timelineLine} />}
            </View>
            <View style={styles.placeCard}>
              <Text style={styles.placeEmoji}>{item.emoji || '📍'}</Text>
              <View style={styles.placeInfo}>
                <Text style={styles.placeName}>{item.name}</Text>
                <Text style={styles.placeLoc} numberOfLines={1}>{item.loc || ''}</Text>
                {item.time && (
                  <View style={styles.timeTag}>
                    <Clock size={10} color={Colors.primary} />
                    <Text style={styles.timeTagText}>{item.time}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  const renderBudgetView = () => {
    const totalSpent = (displayTrip?.expenses || []).reduce((acc: number, curr: any) => acc + (curr.amountKRW || 0), 0);
    const budgetLimit = displayTrip?.budgetSettings?.limitKRW || 1000000;
    const progress = Math.min(totalSpent / budgetLimit, 1);

    return (
      <View style={styles.viewContainer}>
        <Text style={styles.sectionTitleLabel}>Budget Status</Text>
        <View style={styles.budgetCardLarge}>
          <View style={styles.budgetHeaderRow}>
            <View style={styles.budgetIconCircle}>
              <Wallet size={18} color={Colors.success} />
            </View>
            <Text style={styles.budgetMainValue}>₩{totalSpent.toLocaleString()}</Text>
            <View style={styles.budgetBadge}>
              <Text style={styles.budgetBadgeText}>{Math.round(progress * 100)}%</Text>
            </View>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: progress > 0.9 ? Colors.danger : Colors.success }]} />
          </View>
          <Text style={styles.budgetLimitText}>Limit: ₩{budgetLimit.toLocaleString()}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        region={region}
        showsUserLocation={true}
        onRegionChangeComplete={setRegion}
        customMapStyle={MAP_STYLE}
      >
        {allMarkers.map((item: any, index: number) => (
          <Marker
            key={item.id || index}
            coordinate={{ latitude: Number(item.lat), longitude: Number(item.lng) }}
            title={item.name}
            pinColor={Colors.primary}
          />
        ))}
        {polylinePath.length >= 2 && <Polyline coordinates={polylinePath} strokeWidth={3} strokeColor={Colors.primary} lineDashPattern={[6, 4]} />}
      </MapView>

      {/* Floating Top Search Bar */}
      <View style={[styles.headerSearchWrapper, { top: insets.top + 12 }]}>
        <BlurView intensity={80} tint="light" style={styles.glassSearch}>
          <Search color={Colors.text.muted} size={18} />
          <TextInput style={styles.glassInput} placeholder="어디로 떠나시나요?" placeholderTextColor={Colors.text.muted} />
          <TouchableOpacity style={styles.searchBtn}>
            <Search color="white" size={20} />
          </TouchableOpacity>
        </BlurView>
      </View>

      {/* Floating Actions */}
      <View style={[styles.floatingBtns, { top: insets.top + 80 }]}>
        <TouchableOpacity style={styles.fab} onPress={() => mapRef.current?.animateToRegion(region)}>
          <Navigation color={Colors.primary} size={20} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fab, { marginTop: 12, backgroundColor: Colors.primary }]} onPress={handleAIAnalysis}>
          <Sparkles color="white" size={20} />
        </TouchableOpacity>
      </View>

      {/* Sidebar/Bottom Sheet Overlay */}
      <Animated.View style={[styles.sidebarSheet, { height: sheetHeight }]}>
        <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
        
        {/* Navigation Tabs Header */}
        <View style={styles.sheetHeader}>
          <View {...panResponder.panHandlers} style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>
          
          <View style={styles.brandRow}>
            <View>
              <Text style={styles.brandName}>WorldPro</Text>
              <Text style={styles.brandSub}>GLOBAL TRAVEL PLANNER</Text>
            </View>
            <View style={styles.authBadge}>
              <Text style={styles.authText}>LOGIN</Text>
            </View>
          </View>

          <View style={styles.navRow}>
            <View style={styles.navGroup}>
              <TouchableOpacity 
                style={[styles.navTab, viewMode === 'trips' && { backgroundColor: Colors.secondary }]}
                onPress={() => setViewMode('trips')}
              >
                <Plane size={18} color={viewMode === 'trips' ? 'white' : Colors.text.muted} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.navTab, viewMode === 'favorites' && { backgroundColor: Colors.danger }]}
                onPress={() => setViewMode('favorites')}
              >
                <Heart size={18} color={viewMode === 'favorites' ? 'white' : Colors.text.muted} />
              </TouchableOpacity>
            </View>
            
            {displayTrip && (
              <View style={[styles.navGroup, { marginLeft: 12, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: Colors.border.light }]}>
                <TouchableOpacity 
                  style={[styles.navTab, viewMode === 'itinerary' && { backgroundColor: Colors.primary }]}
                  onPress={() => setViewMode('itinerary')}
                >
                  <Calendar size={18} color={viewMode === 'itinerary' ? 'white' : Colors.text.muted} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.navTab, viewMode === 'budget' && { backgroundColor: Colors.success }]}
                  onPress={() => setViewMode('budget')}
                >
                  <Wallet size={18} color={viewMode === 'budget' ? 'white' : Colors.text.muted} />
                </TouchableOpacity>
              </View>
            )}
            
            <TouchableOpacity style={styles.shareBadge}>
              <Share2 size={14} color={Colors.secondary} />
              <Text style={styles.shareText}>INVITE</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.viewScroll} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {viewMode === 'trips' && renderTripsView()}
          {viewMode === 'favorites' && renderFavoritesView()}
          {viewMode === 'itinerary' && renderItineraryView()}
          {viewMode === 'budget' && renderBudgetView()}
        </ScrollView>
      </Animated.View>

      {/* AI Analysis Modal */}
      <Modal visible={showAIModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.aiModalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.aiHeaderIcon}><Brain color="white" size={24} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>AI 여행 분석 리포트</Text>
                <Text style={styles.modalSubtitle}>Gemini 2.0 Flash 분석</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAIModal(false)}><X size={24} color={Colors.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.aiScroll}>
              {isAnalyzing ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loadingText}>일정을 분석하고 있습니다...</Text>
                </View>
              ) : aiReport ? (
                <View>
                  <View style={styles.scoreBox}>
                    <Text style={styles.scoreNum}>{aiReport.score}</Text>
                    <Text style={styles.scoreSum}>{aiReport.summary}</Text>
                  </View>
                  {aiReport.sections.map((s, i) => (
                    <View key={i} style={styles.aiSection}>
                      <View style={styles.aiSectionHead}>
                        <CheckCircle2 size={16} color={Colors.primary} />
                        <Text style={styles.aiSectionTitle}>{s.title}</Text>
                      </View>
                      <Text style={styles.aiSectionContent}>{s.content}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { ...StyleSheet.absoluteFillObject },

  // Header Search
  headerSearchWrapper: { position: 'absolute', left: 16, right: 16, zIndex: 3000 },
  glassSearch: { 
    flexDirection: 'row', alignItems: 'center', padding: 6, borderRadius: 24, 
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20,
  },
  glassInput: { flex: 1, height: 48, paddingLeft: 12, fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text.primary },
  searchBtn: { width: 44, height: 44, backgroundColor: Colors.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  // FABs
  floatingBtns: { position: 'absolute', right: 16, zIndex: 10 },
  fab: { 
    width: 48, height: 48, borderRadius: 24, backgroundColor: 'white', 
    justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 
  },

  // Sidebar Sheet
  sidebarSheet: { 
    position: 'absolute', left: 0, right: 0, bottom: 0, 
    backgroundColor: 'rgba(255,255,255,0.9)', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 30, elevation: 20,
    overflow: 'hidden'
  },
  dragHandleContainer: { width: '100%', alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border.medium },
  
  sheetHeader: { paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border.light },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  brandName: { fontSize: 24, fontFamily: 'Inter_900Black', color: Colors.text.primary, letterSpacing: -1 },
  brandSub: { fontSize: 9, fontFamily: 'Inter_900Black', color: Colors.primary, letterSpacing: 1.5, marginTop: -2 },
  authBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  authText: { fontSize: 10, fontFamily: 'Inter_900Black', color: Colors.text.secondary },

  navRow: { flexDirection: 'row', alignItems: 'center' },
  navGroup: { flexDirection: 'row', gap: 8 },
  navTab: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  shareBadge: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f5f3ff', paddingHorizontal: 12, height: 40, borderRadius: 12 },
  shareText: { fontSize: 11, fontFamily: 'Inter_900Black', color: Colors.secondary },

  viewScroll: { flex: 1 },
  viewContainer: { padding: 24 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sectionTitleLabel: { fontSize: 12, fontFamily: 'Inter_900Black', color: Colors.secondary, letterSpacing: 2, textTransform: 'uppercase' },
  inlineActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f5f3ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  inlineActionText: { fontSize: 11, fontFamily: 'Inter_900Black', color: Colors.secondary },

  // Trip Cards
  tripCard: { 
    padding: 20, backgroundColor: 'white', borderRadius: 20, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border.light, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 10
  },
  tripCardActive: { borderColor: Colors.secondary, backgroundColor: '#f5f3ff' },
  tripCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  tripCardTitle: { fontSize: 17, fontFamily: 'Inter_900Black', color: Colors.text.primary, flex: 1 },
  tripCardActions: { flexDirection: 'row', gap: 8 },
  tripActionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },
  tripCardInfoRow: { flexDirection: 'row', gap: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoItemText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text.secondary },

  emptyCard: { padding: 40, alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: Colors.border.light, borderRadius: 24 },
  emptyCardText: { marginTop: 12, fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text.muted, textTransform: 'uppercase' },

  // Itinerary
  tripHeader: { marginBottom: 20 },
  tripTitleLarge: { fontSize: 22, fontFamily: 'Inter_900Black', color: Colors.text.primary },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dateText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text.secondary },
  daySelector: { marginBottom: 20 },
  dayChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8 },
  dayChipActive: { backgroundColor: Colors.primary },
  dayChipText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text.secondary },
  dayChipTextActive: { color: 'white' },
  itineraryItem: { flexDirection: 'row', marginBottom: 4 },
  timelineContainer: { width: 20, alignItems: 'center', paddingTop: 18 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  timelineLine: { width: 2, flex: 1, backgroundColor: Colors.border.light, marginVertical: 4 },
  placeCard: { 
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, 
    backgroundColor: 'white', borderRadius: 16, marginLeft: 8, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border.light
  },
  placeEmoji: { fontSize: 20 },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text.primary },
  placeLoc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.text.muted },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  timeTagText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.primary },
  emptyDayPlaceholder: { padding: 30, alignItems: 'center', backgroundColor: Colors.background.sub, borderRadius: 20 },
  emptyDayText: { fontSize: 13, color: Colors.text.muted },

  // Budget
  budgetCardLarge: { backgroundColor: Colors.background.sub, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: Colors.border.light },
  budgetHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  budgetIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ecfdf5', justifyContent: 'center', alignItems: 'center' },
  budgetMainValue: { flex: 1, marginLeft: 12, fontSize: 24, fontFamily: 'Inter_900Black', color: Colors.text.primary },
  budgetBadge: { backgroundColor: Colors.success, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  budgetBadgeText: { fontSize: 12, fontFamily: 'Inter_900Black', color: 'white' },
  progressBarBg: { height: 10, backgroundColor: Colors.border.light, borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  progressBarFill: { height: '100%' },
  budgetLimitText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text.muted },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  aiModalContent: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, height: height * 0.8, padding: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  aiHeaderIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontFamily: 'Inter_900Black', color: Colors.text.primary },
  modalSubtitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.primary },
  aiScroll: { flex: 1 },
  loadingBox: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text.secondary },
  scoreBox: { padding: 24, backgroundColor: '#f5f3ff', borderRadius: 24, alignItems: 'center', marginBottom: 20 },
  scoreNum: { fontSize: 48, fontFamily: 'Inter_900Black', color: Colors.secondary },
  scoreSum: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text.secondary, textAlign: 'center', marginTop: 8 },
  aiSection: { marginBottom: 20 },
  aiSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  aiSectionTitle: { fontSize: 16, fontFamily: 'Inter_900Black', color: Colors.text.primary },
  aiSectionContent: { fontSize: 14, lineHeight: 20, color: Colors.text.secondary, fontFamily: 'Inter_400Regular' },
});
