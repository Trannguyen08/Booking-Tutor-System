import { useState, useEffect, useCallback } from 'react';
import { publicClient } from '../api/client';

export const useTutors = () => {
  const [tutors, setTutors] = useState<any[]>([]);
  const [pagination, setPagination] = useState<{
    count: number;
    page: number;
    page_size: number;
    total_pages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTutors = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const res = await publicClient.get('/tutors/public/', { params: filters });
      if (Array.isArray(res.data)) {
        setTutors(res.data);
        setPagination({
          count: res.data.length,
          page: 1,
          page_size: 10,
          total_pages: Math.max(1, Math.ceil(res.data.length / 10)),
        });
      } else {
        const results = Array.isArray(res.data?.results) ? res.data.results : [];
        setTutors(results);
        setPagination({
          count: Number(res.data?.count ?? results.length),
          page: Number(res.data?.page ?? 1),
          page_size: Number(res.data?.page_size ?? 10),
          total_pages: Number(res.data?.total_pages ?? 1),
        });
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error fetching tutors');
    } finally {
      setLoading(false);
    }
  }, []);

  return { tutors, pagination, loading, error, fetchTutors };
};

export const useSubjects = () => {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubjects = useCallback(async () => {
    try {
      const res = await publicClient.get('/tutors/subjects/');
      setSubjects(res.data);
    } catch (err) {
      console.error("Error fetching subjects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  return { subjects, loading };
};
