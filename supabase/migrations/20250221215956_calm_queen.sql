/*
  # Fix Authentication Schema

  1. Tables
    - user_profiles: Stores user profile information
      - id: UUID primary key
      - auth_user_id: References auth.users
      - username: Unique username
      - email: User's email
      - created_at: Timestamp
      - updated_at: Timestamp
    
    - user_settings: Stores user preferences
      - id: UUID primary key
      - user_id: References user_profiles
      - theme: UI theme preference
      - notifications_enabled: Notification settings
      - telegram_chat_id: Telegram integration
      - created_at: Timestamp
      - updated_at: Timestamp

  2. Security
    - RLS policies for both tables
    - INSERT policies for trigger functionality
    - Secure trigger function for user creation
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects to ensure clean slate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
  DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
  DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Recreate tables with proper structure
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS user_profiles;

-- Create user_profiles table
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  username text NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(auth_user_id),
  UNIQUE(username)
);

-- Create user_settings table
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  theme text DEFAULT 'light',
  notifications_enabled boolean DEFAULT true,
  telegram_chat_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "System can insert user profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can delete user profile"
  ON user_profiles
  FOR DELETE
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Create policies for user_settings
CREATE POLICY "Users can view own settings"
  ON user_settings
  FOR SELECT
  TO authenticated
  USING (user_id IN (
    SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can update own settings"
  ON user_settings
  FOR UPDATE
  TO authenticated
  USING (user_id IN (
    SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "System can insert user settings"
  ON user_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can delete user settings"
  ON user_settings
  FOR DELETE
  TO authenticated
  USING (user_id IN (
    SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
  ));

-- Function to handle new user creation
CREATE FUNCTION handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  profile_id uuid;
BEGIN
  -- Create user profile
  INSERT INTO user_profiles (auth_user_id, username, email)
  VALUES (
    NEW.id,
    LOWER(SPLIT_PART(NEW.email, '@', 1)), -- Use email prefix as username
    NEW.email
  )
  RETURNING id INTO profile_id;

  -- Create user settings
  INSERT INTO user_settings (user_id)
  VALUES (profile_id);

  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();