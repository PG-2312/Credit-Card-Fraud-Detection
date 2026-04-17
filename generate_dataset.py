import pandas as pd
import numpy as np

# Configuration
n_rows = 100_000
n_fraud = 1_000  # 1% fraud rate
output_file = 'synthetic_test_dataset.csv'

print(f"🔄 Generating {n_rows:,} simulated transactions...")

# 1. Base structure
df = pd.DataFrame()
df['step'] = np.random.randint(1, 744, n_rows) # 1 to 31 days mapped arbitrarily

# Normal transaction types roughly mimicking real distribution
types = ['PAYMENT', 'TRANSFER', 'CASH_OUT', 'DEBIT', 'CASH_IN']
probs = [0.35, 0.08, 0.35, 0.02, 0.20]
df['type'] = np.random.choice(types, p=probs, size=n_rows)

# Normal amounts
df['amount'] = np.random.lognormal(mean=5, sigma=2, size=n_rows).clip(1, 10_000_000).round(2)

# Normal balances
df['oldbalanceOrg'] = np.random.lognormal(mean=6, sigma=2, size=n_rows).clip(0, 20_000_000).round(2)

# Normal logic for newbalanceOrig
# Usually new_bal = old_bal - amount if sending, old_bal + amount if receiving
def calc_new_orig(row):
    if row['type'] in ['CASH_OUT', 'PAYMENT', 'TRANSFER', 'DEBIT']:
        return max(0, row['oldbalanceOrg'] - row['amount'])
    else: # CASH_IN
        return row['oldbalanceOrg'] + row['amount']

df['newbalanceOrig'] = df.apply(calc_new_orig, axis=1).round(2)

df['oldbalanceDest'] = np.random.lognormal(mean=7, sigma=2, size=n_rows).clip(0, 50_000_000).round(2)

# Normal logic for newbalanceDest
def calc_new_dest(row):
    if row['type'] in ['CASH_IN', 'PAYMENT']:
        # Dest balance typically not tracked for Merchants (PAYMENT)
        return 0 if row['type'] == 'PAYMENT' else max(0, row['oldbalanceDest'] - row['amount'])
    else: # CASH_OUT, TRANSFER
        return row['oldbalanceDest'] + row['amount']

df['newbalanceDest'] = df.apply(calc_new_dest, axis=1).round(2)

df['isFraud'] = 0
df['isFlaggedFraud'] = 0

# 2. Inject Fraud accurately
print(f"💉 Injecting {n_fraud:,} sophisticated fraud patterns...")
fraud_indices = np.random.choice(df.index, size=n_fraud, replace=False)
df.loc[fraud_indices, 'isFraud'] = 1

# Fraud only really exists on TRANSFER and CASH_OUT
df.loc[fraud_indices, 'type'] = np.random.choice(['TRANSFER', 'CASH_OUT'], size=n_fraud)

# Apply key fraud physics: 
# Fraudsters drain the full account.
df.loc[fraud_indices, 'amount'] = df.loc[fraud_indices, 'oldbalanceOrg']
df.loc[fraud_indices, 'newbalanceOrig'] = 0

# Create accounting discrepancies on the destination side (highly suspicious)
mask_vanish = np.random.rand(n_fraud) < 0.6  # 60% of frauds have vanishing money
vanish_indices = fraud_indices[mask_vanish]
df.loc[vanish_indices, 'newbalanceDest'] = df.loc[vanish_indices, 'oldbalanceDest'] # No change = error

# For others, it's a normal transfer to a mule
normal_fraud = fraud_indices[~mask_vanish]
df.loc[normal_fraud, 'newbalanceDest'] = df.loc[normal_fraud, 'oldbalanceDest'] + df.loc[normal_fraud, 'amount']

# Extremely large transfers get flagged
df.loc[(df['amount'] > 2_000_000) & (df['type'] == 'TRANSFER'), 'isFlaggedFraud'] = 1

# 3. Add identifiers
print("🆔 Generating unique transaction identifiers...")
df['nameOrig'] = ['C' + str(i) for i in np.random.randint(10000000, 99999999, n_rows)]
df['nameDest'] = [('M' if t == 'PAYMENT' else 'C') + str(i) for t, i in zip(df['type'], np.random.randint(10000000, 99999999, n_rows))]

# Reorder columns to exactly match original schema
cols = ['step', 'type', 'amount', 'nameOrig', 'oldbalanceOrg', 'newbalanceOrig', 
        'nameDest', 'oldbalanceDest', 'newbalanceDest', 'isFraud', 'isFlaggedFraud']
df = df[cols]

# 4. Export
df.to_csv(output_file, index=False)
print(f"✅ Created {output_file} successfully in the project directory.")
