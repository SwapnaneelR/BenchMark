import { useEffect, useState } from 'react';

interface Entry {
  team: string;
  score: number;
}

// TODO: style the leaderboard
export default function Leaderboard() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const poll = async () => {
      const res = await fetch('/leaderboard');
      setEntries(await res.json());
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <table>
      <thead>
        <tr><th>#</th><th>Team</th><th>Score</th></tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={e.team}>
            <td>{i + 1}</td>
            <td>{e.team}</td>
            <td>{e.score.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
