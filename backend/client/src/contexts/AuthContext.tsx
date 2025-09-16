import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AuthService from '../services/AuthService';
import { User, AuthState } from '../services/auth.types';

// Actions du reducer
type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_TOKEN'; payload: string | null }
  | { type: 'LOGOUT' };

// Reducer to manage authentication state
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false
      };
    
    case 'SET_TOKEN':
      return { ...state, token: action.payload };
    
    case 'LOGOUT':
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false
      };
    
    default:
      return state;
  }
};

// Initial state
const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true
};

// Interface du contexte
interface AuthContextType {
  state: AuthState;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  updateProfile: (userData: Partial<Pick<User, 'username' | 'email'>>) => Promise<{ success: boolean; message?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  refreshUser: () => Promise<void>;
}

// Création du contexte
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider du contexte
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const authService = AuthService.getInstance();

  // Authentication check on load
  useEffect(() => {
    const checkAuth = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const storedUser = authService.getCurrentUser();
      const storedToken = authService.getCurrentToken();
      
      if (storedUser && storedToken) {
        // Verify that token is still valid
        const user = await authService.verifyToken();
        if (user) {
          dispatch({ type: 'SET_USER', payload: user });
          dispatch({ type: 'SET_TOKEN', payload: storedToken });
        } else {
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    checkAuth();
  }, []);

  // Login function
  const login = async (email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      const response = await authService.login({ email, password });
      
      if (response.success && response.data) {
        dispatch({ type: 'SET_USER', payload: response.data.user });
        dispatch({ type: 'SET_TOKEN', payload: response.data.token });
        return { success: true };
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
        return { 
          success: false, 
          message: response.message || 'Login error' 
        };
      }
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return { 
        success: false, 
        message: 'Server connection error' 
      };
    }
  };

  // Registration function
  const register = async (username: string, email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      const response = await authService.register({ username, email, password });
      
      if (response.success && response.data) {
        dispatch({ type: 'SET_USER', payload: response.data.user });
        dispatch({ type: 'SET_TOKEN', payload: response.data.token });
        return { success: true };
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
        return { 
          success: false, 
          message: response.message || 'Error creating account' 
        };
      }
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return { 
        success: false, 
        message: 'Server connection error' 
      };
    }
  };

  // Logout function
  const logout = async () => {
    await authService.logout();
    dispatch({ type: 'LOGOUT' });
  };

  // Profile update function
  const updateProfile = async (userData: Partial<Pick<User, 'username' | 'email'>>) => {
    try {
      const response = await authService.updateProfile(userData);
      
      if (response.success && response.data) {
        dispatch({ type: 'SET_USER', payload: response.data.user });
        return { success: true };
      } else {
        return { 
          success: false, 
          message: response.message || 'Update error' 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        message: 'Server connection error' 
      };
    }
  };

  // Password change function
  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const response = await authService.changePassword(currentPassword, newPassword);
      
      return {
        success: response.success,
        message: response.message || (response.success ? 'Password changed' : 'Error')
      };
    } catch (error) {
      return { 
        success: false, 
        message: 'Server connection error' 
      };
    }
  };

  // User data refresh function
  const refreshUser = async () => {
    if (state.isAuthenticated) {
      const user = await authService.getProfile();
      if (user) {
        dispatch({ type: 'SET_USER', payload: user });
      }
    }
  };

  const contextValue: AuthContextType = {
    state,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    refreshUser
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use authentication context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};