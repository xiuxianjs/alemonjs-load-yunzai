import { getConfigValue, useUserHashKey } from 'alemonjs';

/**
 * 判断用户是否为主人
 * @param UserId
 * @param platform
 * @returns
 */
export const isMaster = (UserId: string, platform: string) => {
  const values = getConfigValue() ?? {};
  const mainMasterKey = values.master_key ?? [];
  const mainMasterId = values.master_id ?? [];
  const value = values[platform] ?? {};
  const masterKey = value.master_key ?? [];
  const masterId = value.master_id ?? [];
  const UserKey = useUserHashKey({
    Platform: platform,
    UserId: UserId
  });
  const cMaster = mainMasterKey.concat(masterKey);
  const cMasterId = mainMasterId.concat(masterId);

  return cMaster.includes(UserKey) ?? cMasterId.includes(UserId);
};
