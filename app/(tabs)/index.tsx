import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, Button, Image, TouchableOpacity, ActivityIndicator, Alert, ScrollView, RefreshControl } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import NetInfo from '@react-native-community/netinfo';
import { SUPABASE_URL, SUPABASE_KEY } from '@env';

// TypeScript interfaces
interface Submission {
  id: string;
  name: string;
  image_url: string;
  created_at?: string;
}

interface ImagePickerResult {
  canceled: boolean;
  assets?: Array<{
    uri: string;
    width?: number;
    height?: number;
    type?: string;
    fileName?: string;
    fileSize?: number;
  }>;
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function HomeScreen() {
  const [name, setName] = useState<string>('');
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // Check network connectivity
  useEffect(() => {
    const checkNetworkConnection = async () => {
      const networkState = await NetInfo.fetch();
      setIsConnected(networkState.isConnected);
    };

    checkNetworkConnection();

    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        Alert.alert('Network Connection Lost', 'You are currently offline. Some features may not work correctly.');
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Get camera permissions
  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Sorry, we need camera roll permissions to make this work!');
      }
    })();
  }, []);

  // Fetch existing submissions
  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setLoadingSubmissions(true);
    try {
      const { data, error } = await supabase
        .from('form_submissions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) setSubmissions(data as Submission[]);
    } catch (error: any) {
      console.error('Error fetching submissions:', error);
      Alert.alert('Error', error.message || 'Failed to load submissions');
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSubmissions().then(() => {
      setRefreshing(false);
    });
  }, []);

  // Pick image from library
  const pickImage = async () => {
    let result: ImagePickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      allowsMultipleSelection: false,
      maxWidth: 800,
      maxHeight: 800,
    });

    if (!result.canceled && result.assets) {
      setImage(result.assets[0].uri);
    }
  };

  // Submit form data to Supabase
  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    
    if (!image) {
      Alert.alert('Error', 'Please select an image');
      return;
    }
    
    if (!isConnected) {
      Alert.alert('Error', 'No network connection. Please try again later.');
      return;
    }
    
    setUploading(true);
    
    try {
      // 1. Upload image to Supabase Storage
      const fileExt = image.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      // Convert image URI to Blob
      const response = await fetch(image);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      
      const blob = await response.blob();
      
      // Check file size (limit to 5MB)
      if (blob.size > 5 * 1024 * 1024) {
        Alert.alert('Error', 'Image size must be less than 5MB');
        setUploading(false);
        return;
      }
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('form_images')
        .upload(filePath, blob);
      
      if (uploadError) throw uploadError;
      
      // Get public URL for the uploaded image
      const { data: urlData } = supabase
        .storage
        .from('form_images')
        .getPublicUrl(filePath);
      
      const imageUrl = urlData.publicUrl;
      
      // 2. Store form data in database
      const { data, error } = await supabase
        .from('form_submissions')
        .insert([
          { name, image_url: imageUrl }
        ]);
      
      if (error) throw error;
      
      // Reset form
      setName('');
      setImage(null);
      Alert.alert('Success', 'Your information has been saved!');
      
      // Refresh submissions list
      fetchSubmissions();
      
    } catch (error: any) {
      console.error('Error submitting form:', error);
      const errorMessage = error.message || 'Something went wrong while submitting your form';
      Alert.alert('Error', errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You are offline</Text>
        </View>
      )}
      
      <Text style={styles.title}>Supabase Form Demo</Text>
      
      <View style={styles.form}>
        <Text style={styles.label} nativeID="nameLabel">Name:</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter your name"
          accessibilityLabel="Enter your name"
          accessibilityHint="Enter your full name here"
          accessibilityLabelledBy="nameLabel"
          returnKeyType="next"
        />
        
        <Text style={styles.label} nativeID="imageLabel">Image:</Text>
        <TouchableOpacity 
          style={styles.imagePicker} 
          onPress={pickImage}
          accessible={true}
          accessibilityLabel="Select an image"
          accessibilityHint="Opens your photo gallery to select an image"
          accessibilityRole="button"
          accessibilityLabelledBy="imageLabel"
        >
          {image ? (
            <Image 
              source={{ uri: image }} 
              style={styles.imagePreview} 
              accessibilityLabel="Preview of selected image"
            />
          ) : (
            <Text style={styles.imagePickerText}>Tap to select an image</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.submitButton, (uploading || !name || !image) && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={uploading || !name || !image}
          accessible={true}
          accessibilityLabel={uploading ? "Submitting form" : "Submit form"}
          accessibilityHint="Uploads image and submits your form"
          accessibilityRole="button"
          accessibilityState={{ disabled: uploading || !name || !image }}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit</Text>
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.submissionsList}>
        <Text style={styles.submissionsTitle}>Recent Submissions</Text>
        {loadingSubmissions ? (
          <ActivityIndicator size="large" color="#0284c7" style={{ marginTop: 20 }} />
        ) : submissions.length > 0 ? (
          submissions.map((item) => (
            <View key={item.id} style={styles.submissionItem} accessibilityRole="listitem">
              <Image 
                source={{ uri: item.image_url }} 
                style={styles.submissionImage}
                onError={(e) => console.log('Image loading error:', e.nativeEvent.error)}
                defaultSource={require('../../assets/images/icon.png')}
                accessible={true}
                accessibilityLabel={`Image uploaded by ${item.name}`}
              />
              <Text style={styles.submissionName}>{item.name}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No submissions yet</Text>
        )}
      </View>
      
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  imagePicker: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    height: 150,
    marginBottom: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imagePickerText: {
    color: '#888',
  },
  submitButton: {
    backgroundColor: '#0284c7',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#93c5fd',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submissionsList: {
    flex: 1,
  },
  submissionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  submissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  submissionImage: {
    width: 50,
    height: 50,
    borderRadius: 5,
    marginRight: 10,
  },
  submissionName: {
    fontSize: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
  offlineBanner: {
    backgroundColor: '#ffcccb',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    alignItems: 'center',
  },
  offlineText: {
    color: '#d32f2f',
    fontSize: 16,
    fontWeight: 'bold',
  },
});