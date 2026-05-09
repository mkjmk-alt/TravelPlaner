import { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { Colors } from '../../src/theme/colors';
import { useTripStore } from '../../src/stores/tripStore';
import { Plus, Calendar, MapPin, ChevronRight, Upload } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

export default function TripsScreen() {
  const { trips, loading, fetchTrips, setActiveTrip } = useTripStore();
  const router = useRouter();

  useEffect(() => {
    fetchTrips();
  }, []);

  const handleUploadJson = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const tripData = JSON.parse(fileContent);

      // Basic validation
      if (!tripData.name || !tripData.startDate || !tripData.endDate) {
        Alert.alert('오류', '올바른 여행 일정 JSON 형식이 아닙니다. (name, startDate, endDate 필수)');
        return;
      }

      await addTrip({
        name: tripData.name,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        itinerary: (tripData.itinerary || []).map((item: any) => ({
          ...item,
          id: item.id || Math.random().toString(36).substr(2, 9),
        })),
        expenses: (tripData.expenses || []).map((item: any) => ({
          ...item,
          id: item.id || Math.random().toString(36).substr(2, 9),
          createdAt: item.createdAt || new Date().toISOString(),
        })),
        budget: tripData.budget || 0,
        currency: tripData.currency || 'KRW',
        color: tripData.color,
      });

      Alert.alert('성공', '여행 일정이 성공적으로 추가되었습니다.');
    } catch (error) {
      console.error('Error uploading JSON:', error);
      Alert.alert('오류', '파일을 처리하는 중 오류가 발생했습니다.');
    }
  };

  const renderTripCard = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => {
        setActiveTrip(item);
        router.push(`/(tabs)/trips/${item.id}`);
      }}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.tripName}>{item.name}</Text>
          <ChevronRight color={Colors.text.muted} size={20} />
        </View>
        
        <View style={styles.infoRow}>
          <Calendar color={Colors.primary} size={16} />
          <Text style={styles.infoText}>
            {item.startDate} ~ {item.endDate}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <MapPin color={Colors.secondary} size={16} />
          <Text style={styles.infoText}>
            {item.itinerary?.length || 0}개의 장소 저장됨
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading && trips.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>나의 여행</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.uploadButton} onPress={handleUploadJson}>
            <Upload color={Colors.primary} size={24} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(tabs)/trips/create')}>
            <Plus color="white" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      {trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <MapPin color={Colors.text.muted} size={48} />
          </View>
          <Text style={styles.emptyTitle}>아직 등록된 여행이 없습니다</Text>
          <Text style={styles.emptySubtitle}>첫 번째 여행 계획을 만들어보세요!</Text>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => router.push('/(tabs)/trips/create')}
          >
            <Text style={styles.primaryButtonText}>여행 시작하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={trips}
          renderItem={renderTripCard}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: Colors.background.main,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_900Black',
    color: Colors.text.primary,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  uploadButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.background.main,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  listContent: {
    padding: 24,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.background.main,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  cardContent: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripName: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text.secondary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.border.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
});
