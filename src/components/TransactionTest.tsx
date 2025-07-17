import { useState, useEffect } from 'react';

export default function TransactionTest() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        console.log('🔍 Testing transactions API call...');
        const response = await fetch('/api/transactions?accountType=CURRENT');
        const data = await response.json();
        console.log('🔍 API Response:', data);
        setTransactions(data);
      } catch (error) {
        console.error('Error loading transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Transaction Test</h2>
      <p>Found {transactions.length} transactions</p>
      <ul>
        {transactions.map((transaction: any) => (
          <li key={transaction.id}>
            {transaction.date} - {transaction.description} - {transaction.amount}€
          </li>
        ))}
      </ul>
    </div>
  );
}
