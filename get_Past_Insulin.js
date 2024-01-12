function getLast8HoursInsulin(entries) {
  const eightHoursAgo = new Date();
  eightHoursAgo.setHours(eightHoursAgo.getHours() - 8);

  return entries.reduce((acc, entry, index) => {
    const entryTimestamp = new Date(entry.timestamp);

    if (entryTimestamp < eightHoursAgo) {
      return acc; // Skip entries older than 8 hours
    }

    if (entry._type === "TempBasalDuration" && index + 1 < entries.length) {
      const nextEntry = entries[index + 1];
      if (
        nextEntry._type === "TempBasal" &&
        nextEntry.timestamp === entry.timestamp
      ) {
        return acc + nextEntry.rate * (entry["duration (min)"] / 60);
      }
    } else if (entry._type === "Bolus") {
      return acc + entry.amount;
    }

    return acc;
  }, 0);
}
