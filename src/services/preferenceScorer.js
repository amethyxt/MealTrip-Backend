function scorePlaces(places, preferences = {}) {

  const foodWeight = preferences.food === "high" ? 2 : 1;

  return places.map(p => {

    let score = 10;

    if (p.category === "restaurant") {
      score += 10 * foodWeight;
    }

    return {
      ...p,
      score
    };
  })
  .sort((a,b) => b.score - a.score);
}

module.exports = { scorePlaces };