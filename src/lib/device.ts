import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'aesn_device_id';

export const getDeviceId = (): string => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};
