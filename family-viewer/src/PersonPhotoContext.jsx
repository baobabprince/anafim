import React, { createContext, useContext, useEffect, useState } from 'react';
import { getBundlePhotoPersonIds, getPersonPhotos } from './photo-storage.js';

export const PersonPhotoContext = createContext(null);

export function usePersonPhotos(personId, notifyError = false, limit = Infinity) {
  const context = useContext(PersonPhotoContext);
  const [urls, setUrls] = useState([]);
  const bundleId = context?.bundleId;
  const remembered = context?.remembered;
  const transientPhotos = context?.photos;
  const revision = context?.revision;
  const onPhotoError = context?.onPhotoError;

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    setUrls([]);
    const hasTransient = transientPhotos && Object.hasOwn(transientPhotos, personId);
    const load = async () => {
      try {
        let storedPhotos = [];
        if (remembered && bundleId) {
          const storedIds = await getBundlePhotoPersonIds(bundleId);
          if (storedIds.has(personId)) {
            storedPhotos = await getPersonPhotos(bundleId, personId);
          }
        }
        const temporaryPhotos = hasTransient
          ? Array.isArray(transientPhotos[personId]) ? transientPhotos[personId] : [transientPhotos[personId]]
          : [];
        const photos = [...storedPhotos, ...temporaryPhotos].slice(0, limit);
        const nextUrls = photos.flatMap(photo => {
          if (typeof photo === 'string') return [photo];
          if (photo instanceof Blob) {
            const objectUrl = URL.createObjectURL(photo);
            objectUrls.push(objectUrl);
            return [objectUrl];
          }
          return [];
        });
        if (active) {
          setUrls(nextUrls);
        } else {
          objectUrls.forEach(url => URL.revokeObjectURL(url));
        }
      } catch (error) {
        if (active) {
          if (notifyError) onPhotoError?.(error);
          else console.error('Failed to load local family photo:', error);
        }
      }
    };
    if (personId && (hasTransient || remembered)) load();
    return () => {
      active = false;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [bundleId, personId, remembered, transientPhotos, revision, notifyError, onPhotoError, limit]);

  return urls;
}

export function usePersonPhoto(personId, notifyError = false) {
  return usePersonPhotos(personId, notifyError, 1)[0] || '';
}
