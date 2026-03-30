import { getConfigValue, useUserHashKey } from 'alemonjs';

const isMaster = (UserId, platform) => {
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

export { isMaster };
