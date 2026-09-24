import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          backgroundColor: theme.cardBackground,
          borderTopColor: theme.cardBorder,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        headerStyle: {
          backgroundColor: theme.cardBackground,
        },
        headerTitleStyle: {
          fontWeight: '700',
          color: theme.text,
        },
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Google Drive',
          tabBarLabel: 'Drive',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'cloud' : 'cloud-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="player"
        options={{
          title: 'Video Player',
          tabBarLabel: 'Player',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'play-circle' : 'play-circle-outline'}
              size={26}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="storage"
        options={{
          title: 'Storage & Cache',
          tabBarLabel: 'Storage',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'folder-open' : 'folder-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null, // Hide legacy starter tab
        }}
      />
    </Tabs>
  );
}
