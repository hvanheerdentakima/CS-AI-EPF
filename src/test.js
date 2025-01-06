
(async () => {
    const { TrueSkill, Rate } = await import('ts-trueskill');

    const ts = new TrueSkill();
    console.log('TrueSkill environment initialized:', ts);
})();