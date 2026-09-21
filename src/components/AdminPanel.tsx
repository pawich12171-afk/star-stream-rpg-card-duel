        multiplier: 1,
        type: 'สกิลต่อสู้จากกาชา',
        category: 'general',
        description: newRewardDesc.trim() || 'สกิลต่อสู้ที่ได้รับจากตู้กาชา',
        battleEffect: newRewardBattleEffect,
        battlePower: Math.max(1, Number(newRewardBattlePower) || 1),
        cooldownTurns: Math.max(0, Number(newRewardCooldownTurns) || 0),
        cooldown: Number(newRewardCooldownTurns) > 0 ? `${newRewardCooldownTurns} เทิร์น` : undefined,
        battleCriticalChance: Math.max(0, Math.min(100, Number(newRewardCritChance) || 0)),
        battleCriticalMultiplier: Math.max(1, Number(newRewardCritMultiplier) || 1),
        repeatAttackChance: Math.max(0, Math.min(100, Number(newRewardRepeatAttackChance) || 0)),
        passiveEffects: newSkillPassiveEffects.length ? newSkillPassiveEffects : undefined,
        maxRepeatAttacks: Math.max(1, Math.min(20, Number(newRewardMaxRepeatAttacks) || 1)),
        battleEffects: [...newRewardBattleEffects],
        battleStats: [...newRewardBattleStats],
      } : undefined,
    };

    try {
      await onAddGachaReward(reward);
      setNewRewardName('');
      setNewRewardDesc('');
      setNewRewardCharacteristic('');
      setNewRewardBattleEffect('damage');
      setNewRewardBattlePower(5);
      setNewRewardCooldownTurns(0);
      setNewRewardCritChance(0);
      setNewRewardCritMultiplier(2);
      setNewSkillPassiveEffects([]);
      setNewSkillPassiveName('Skill Passive');
      setNewSkillPassiveKind('stack');
      setNewSkillPassiveValue(1);
      setNewSkillPassiveMaxStacks(6);
      setNewSkillPassiveChance(100);
      setNewSkillPassiveStackKey('skill_stack');
      setNewRewardRepeatAttackChance(0);
      setNewRewardMaxRepeatAttacks(1);
      setNewRewardBattleEffects([]);
      setNewRewardBattleStats([]);
      setNewRewardStatKind('attack_power');
      setNewRewardStatValue(15);
      setNewRewardStatDuration(1);
      setNewRewardEffectKind('bleeding');