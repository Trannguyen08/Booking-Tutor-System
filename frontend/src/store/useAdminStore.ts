import { create } from 'zustand';
import { adminService } from '../services/adminService';

const toArray = (data: any) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const toPagination = (data: any, fallbackCount = 0) => ({
  count: typeof data?.count === 'number' ? data.count : fallbackCount,
  page: typeof data?.page === 'number' ? data.page : 1,
  page_size: typeof data?.page_size === 'number' ? data.page_size : 10,
  total_pages: typeof data?.total_pages === 'number' ? data.total_pages : Math.max(1, Math.ceil((typeof data?.count === 'number' ? data.count : fallbackCount) / 10)),
});

interface AdminState {
  stats: any | null;
  finance: any | null;
  tutors: any[];
  users: any[];
  courses: any[];
  tutorsPagination: { count: number; page: number; page_size: number; total_pages: number };
  usersPagination: { count: number; page: number; page_size: number; total_pages: number };
  coursesPagination: { count: number; page: number; page_size: number; total_pages: number };
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStats: (params?: any) => Promise<void>;
  fetchTutors: (params?: any) => Promise<void>;
  fetchUsers: (params?: any) => Promise<void>;
  fetchCourses: (params?: any) => Promise<void>;
  fetchFinance: (params?: any) => Promise<void>;
  tutorAction: (id: number, action: string, data?: any) => Promise<void>;
  userAction: (id: number, action: string, refreshParams?: any) => Promise<void>;
  courseAction: (id: number, action: string, refreshParams?: any) => Promise<void>;
  financeTutorAction: (id: number, action: string, data?: any, refreshParams?: any) => Promise<void>;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  stats: null,
  finance: null,
  tutors: [],
  users: [],
  courses: [],
  tutorsPagination: { count: 0, page: 1, page_size: 10, total_pages: 1 },
  usersPagination: { count: 0, page: 1, page_size: 10, total_pages: 1 },
  coursesPagination: { count: 0, page: 1, page_size: 10, total_pages: 1 },
  isLoading: false,
  error: null,

  fetchStats: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const stats = await adminService.fetchDashboardStats(params);
      set({ stats, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchTutors: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const tutors = await adminService.fetchTutors(params);
      const list = toArray(tutors);
      set({ tutors: list, tutorsPagination: toPagination(tutors, list.length), isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchUsers: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const users = await adminService.fetchUsers(params);
      const list = toArray(users);
      set({ users: list, usersPagination: toPagination(users, list.length), isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchCourses: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const courses = await adminService.fetchCourses(params);
      const list = toArray(courses);
      set({ courses: list, coursesPagination: toPagination(courses, list.length), isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchFinance: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const finance = await adminService.fetchFinance(params);
      set({ finance, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  tutorAction: async (id, action, data) => {
    try {
      await adminService.performTutorAction(id, action, data);
      // Refresh current list
      get().fetchTutors();
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },

  userAction: async (id, action, refreshParams) => {
    try {
      await adminService.performUserAction(id, action);
      // Refresh current list
      await get().fetchUsers(refreshParams);
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },

  courseAction: async (id, action, refreshParams) => {
    try {
      await adminService.performCourseAction(id, action);
      await get().fetchCourses(refreshParams);
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },

  financeTutorAction: async (id, action, data, refreshParams) => {
    try {
      await adminService.performFinanceTutorAction(id, action, data);
      await get().fetchFinance(refreshParams);
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  }
}));
