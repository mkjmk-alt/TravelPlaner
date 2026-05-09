import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../../../src/theme/colors';
import { useTripStore } from '../../../src/stores/tripStore';
import { ChevronLeft, MoreVertical, MapPin, Clock, DollarSign, X, Plus } from 'lucide-react-native';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams();
  const { activeTrip } = useTripStore();
  const router = useRouter();

  if (!activeTrip) {
    return (
      <View style={styles.center}>
        <Text>여행 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft color={Colors.text.primary} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{activeTrip.name}</Text>
        <TouchableOpacity>
          <MoreVertical color={Colors.text.primary} size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <Text style={styles.dateRange}>{activeTrip.startDate} ~ {activeTrip.endDate}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{activeTrip.itinerary?.length || 0}</Text>
              <Text style={styles.statLabel}>장소</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>₩{activeTrip.budget?.toLocaleString()}</Text>
              <Text style={styles.statLabel}>예산</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>일정</Text>
          {activeTrip.itinerary?.length === 0 ? (
            <Text style={styles.emptyText}>일정에 추가된 장소가 없습니다.</Text>
          ) : (
            activeTrip.itinerary?.map((item, index) => (
              <View key={item.id} style={styles.placeItem}>
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{item.time}</Text>
                  {index < activeTrip.itinerary.length - 1 && <View style={styles.timeline} />}
                </View>
                <View style={styles.placeCard}>
                  <Text style={styles.placeEmoji}>{item.emoji || '📍'}</Text>
                  <View style={styles.placeInfo}>
                    <Text style={styles.placeName}>{item.name}</Text>
                    <Text style={styles.placeLoc}>{item.loc}</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={async () => {
                      const updatedItinerary = activeTrip.itinerary?.filter(i => i.id !== item.id) || [];
                      await useTripStore.getState().updateTrip(activeTrip.id, { itinerary: updatedItinerary });
                    }}
                    style={{ padding: 8 }}
                  >
                    <X color={Colors.text.muted} size={16} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          
          <TouchableOpacity 
            style={styles.addPlaceButton} 
            onPress={() => router.push({ pathname: '/(tabs)/trips/add-place', params: { tripId: activeTrip.id } })}
          >
            <Text style={styles.addPlaceText}>+ 새로운 장소 추가</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/(tabs)/map')}>
        <MapPin color="white" size={24} />
        <Text style={styles.fabText}>지도에서 보기</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.sub,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.background.main,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  content: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: Colors.background.main,
    margin: 20,
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    gap: 16,
  },
  dateRange: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text.secondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Inter_900Black',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.text.muted,
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border.light,
  },
  section: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_900Black',
    color: Colors.text.primary,
    marginBottom: 20,
  },
  placeItem: {
    flexDirection: 'row',
    gap: 16,
  },
  timeColumn: {
    alignItems: 'center',
    width: 50,
  },
  timeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.secondary,
  },
  timeline: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border.light,
    marginVertical: 4,
  },
  placeCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background.main,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  placeEmoji: {
    fontSize: 24,
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
  },
  placeLoc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.text.secondary,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.text.muted,
    fontFamily: 'Inter_400Regular',
    marginTop: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: Colors.text.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  fabText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPlaceButton: {
    backgroundColor: Colors.background.sub,
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  addPlaceText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: Colors.primary,
  },
});
