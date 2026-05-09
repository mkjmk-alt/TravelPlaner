import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../../src/theme/colors';
import { useTripStore } from '../../../src/stores/tripStore';
import { X, MapPin, Clock, AlignLeft } from 'lucide-react-native';

export default function AddPlaceScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams();
  const { trips, updateTrip } = useTripStore();
  
  const trip = trips.find(t => t.id === tripId);

  const [name, setName] = useState('');
  const [loc, setLoc] = useState('');
  const [time, setTime] = useState('');
  const [memo, setMemo] = useState('');

  const handleSave = async () => {
    if (!name || !trip) return;

    const newPlace = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      loc,
      time: time || '12:00',
      memo,
      emoji: '📍',
      place: {
        name,
        address: loc,
        lat: 37.5665 + (Math.random() - 0.5) * 0.1, // 임시 랜덤 좌표
        lng: 126.9780 + (Math.random() - 0.5) * 0.1, // 임시 랜덤 좌표
      }
    };

    const updatedItinerary = [...(trip.itinerary || []), newPlace];
    // 시간순 정렬
    updatedItinerary.sort((a, b) => a.time.localeCompare(b.time));

    await updateTrip(trip.id, { itinerary: updatedItinerary });
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>장소 추가</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <X color={Colors.text.primary} size={24} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>장소 이름 *</Text>
            <View style={styles.inputContainer}>
              <MapPin color={Colors.text.muted} size={20} />
              <TextInput
                style={styles.input}
                placeholder="예: 에펠탑, 맛집 이름 등"
                value={name}
                onChangeText={setName}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>방문 시간</Text>
            <View style={styles.inputContainer}>
              <Clock color={Colors.text.muted} size={20} />
              <TextInput
                style={styles.input}
                placeholder="예: 10:00"
                value={time}
                onChangeText={setTime}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>위치 / 주소</Text>
            <View style={styles.inputContainer}>
              <MapPin color={Colors.text.muted} size={20} />
              <TextInput
                style={styles.input}
                placeholder="예: 파리, 프랑스"
                value={loc}
                onChangeText={setLoc}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>메모</Text>
            <View style={[styles.inputContainer, styles.textAreaContainer]}>
              <AlignLeft color={Colors.text.muted} size={20} style={{ marginTop: 2 }} />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="기억할 내용, 예약 번호 등"
                value={memo}
                onChangeText={setMemo}
                multiline
                numberOfLines={4}
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.saveButton, !name && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!name}
          >
            <Text style={styles.saveButtonText}>일정에 추가하기</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.main,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
  },
  form: {
    flex: 1,
    padding: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.sub,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingLeft: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.text.primary,
  },
  textAreaContainer: {
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  textArea: {
    paddingVertical: 0,
    height: 100,
    textAlignVertical: 'top',
  },
  footer: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
    backgroundColor: Colors.background.main,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.border.dark,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
});
