# Phase 4 — Anchor program changes (deploy in Solana Playground)

The web2 layer already enforces every new rule (influencer-can't-bet, 12h lock,
fee split, refunds) and **displays the correct numbers**. This document is the
on-chain mirror so settlement is trustless. Windows can't build Anchor natively —
do this in **beta.solpg.io**, then re-export the IDL.

The current program is `solana/programs/gymcast/src/lib.rs`. Apply the diffs below.

---

## 1. `Market` state — store the influencer, platform, fees, refunded flag

```rust
#[account]
pub struct Market {
    pub creator: Pubkey,         // unchanged — the wallet that opened the market (the challenger)
    pub authority: Pubkey,       // oracle that resolves
    pub influencer: Pubkey,      // NEW — subject of the line; receives the creator cut; cannot bet
    pub platform: Pubkey,        // NEW — receives the platform fee
    pub creator_fee_bps: u16,    // NEW — e.g. 500 = 5%
    pub platform_fee_bps: u16,   // NEW — e.g. 250 = 2.5%
    pub deadline: i64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub resolved: bool,
    pub refunded: bool,          // NEW — set by refund_market; claim then returns own stake
    pub outcome: u8,
    pub slug: String,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Market {
    // added: 32 influencer + 32 platform + 2 + 2 fee bps + 1 refunded
    pub const SPACE: usize =
        8 + 32 + 32 + 32 + 32 + 2 + 2 + 8 + 8 + 8 + 1 + 1 + 1 + (4 + MAX_SLUG_LEN) + 1 + 1;
}
```

Add two constants near the top:

```rust
/// Bets lock this many seconds before the deadline (12h).
pub const BET_LOCK_SECONDS: i64 = 12 * 60 * 60;
pub const BPS_DENOM: u128 = 10_000;
```

---

## 2. `initialize_market` — accept the new params

```rust
pub fn initialize_market(
    ctx: Context<InitializeMarket>,
    deadline: i64,
    authority: Pubkey,
    influencer: Pubkey,        // NEW
    platform: Pubkey,          // NEW
    creator_fee_bps: u16,      // NEW
    platform_fee_bps: u16,     // NEW
    slug: String,
) -> Result<()> {
    require!(slug.len() <= MAX_SLUG_LEN, GymError::SlugTooLong);
    require!(creator_fee_bps as u128 + platform_fee_bps as u128 <= BPS_DENOM, GymError::FeeTooHigh);
    let now = Clock::get()?.unix_timestamp;
    require!(deadline > now, GymError::DeadlineInPast);

    let market = &mut ctx.accounts.market;
    market.creator = ctx.accounts.creator.key();
    market.authority = authority;
    market.influencer = influencer;
    market.platform = platform;
    market.creator_fee_bps = creator_fee_bps;
    market.platform_fee_bps = platform_fee_bps;
    market.deadline = deadline;
    market.yes_pool = 0;
    market.no_pool = 0;
    market.resolved = false;
    market.refunded = false;
    market.outcome = OUTCOME_UNSET;
    market.slug = slug;
    market.bump = ctx.bumps.market;
    market.vault_bump = ctx.bumps.vault;
    Ok(())
}
```

Update the `#[instruction(...)]` attr on `InitializeMarket` to match the new arg list.

---

## 3. `place_bet` — bar the influencer + lock 12h before the deadline

```rust
    let market = &mut ctx.accounts.market;
    require!(!market.resolved && !market.refunded, GymError::MarketResolved);

    // NEW: the influencer can never bet on their own line.
    require!(ctx.accounts.bettor.key() != market.influencer, GymError::InfluencerCannotBet);

    // CHANGED: lock 12h before the deadline (not at the deadline).
    let now = Clock::get()?.unix_timestamp;
    let lock_at = market.deadline.checked_sub(BET_LOCK_SECONDS).ok_or(GymError::MathOverflow)?;
    require!(now < lock_at, GymError::MarketLocked);
```

---

## 4. `resolve_market` — pay the creator cut + platform fee from the vault

Add `vault`, `influencer`, `platform`, and `system_program` to the `ResolveMarket`
accounts, then skim fees off the **losing** pool before winners claim:

```rust
pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: u8) -> Result<()> {
    require!(outcome == OUTCOME_YES || outcome == OUTCOME_NO, GymError::InvalidOutcome);
    let market = &mut ctx.accounts.market;
    require!(!market.resolved && !market.refunded, GymError::MarketResolved);
    let now = Clock::get()?.unix_timestamp;
    require!(now >= market.deadline, GymError::DeadlineNotReached);

    let (winning_pool, losing_pool) = if outcome == OUTCOME_YES {
        (market.yes_pool, market.no_pool)
    } else {
        (market.no_pool, market.yes_pool)
    };

    market.resolved = true;
    market.outcome = outcome;

    // Two-sided market only: skim fees from the losing pool. One-sided → no fees (refund path in claim).
    if winning_pool > 0 && losing_pool > 0 {
        let creator_fee = ((losing_pool as u128) * market.creator_fee_bps as u128 / BPS_DENOM) as u64;
        let platform_fee = ((losing_pool as u128) * market.platform_fee_bps as u128 / BPS_DENOM) as u64;

        let market_key = market.key();
        let vault_bump = market.vault_bump;
        let seeds: &[&[&[u8]]] = &[&[b"vault", market_key.as_ref(), &[vault_bump]]];

        for (amount, to) in [
            (creator_fee, ctx.accounts.influencer.to_account_info()),
            (platform_fee, ctx.accounts.platform.to_account_info()),
        ] {
            if amount == 0 { continue; }
            require!(ctx.accounts.vault.lamports() >= amount, GymError::InsufficientVault);
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer { from: ctx.accounts.vault.to_account_info(), to },
                    seeds,
                ),
                amount,
            )?;
        }
    }
    Ok(())
}
```

`ResolveMarket` accounts gain (all `mut` except programs):
`vault` (the PDA SystemAccount), `influencer: SystemAccount` (must equal `market.influencer`
— add `address = market.influencer` constraint), `platform: SystemAccount`
(`address = market.platform`), `system_program`.

---

## 5. `claim_winnings` — use the post-fee losing pool, honor `refunded`

Replace the payout block:

```rust
    let payout: u64 = if market.refunded || losing_pool == 0 || winning_pool == 0 {
        // Refunded (no-show/decline) or one-sided → return own stake.
        stake_win.checked_add(stake_lose).ok_or(GymError::MathOverflow)?
    } else if stake_win == 0 {
        0
    } else {
        // Winners split the losing pool AFTER fees.
        let fee_bps = market.creator_fee_bps as u128 + market.platform_fee_bps as u128;
        let effective_losing = (losing_pool as u128) * (BPS_DENOM - fee_bps) / BPS_DENOM;
        let share = (stake_win as u128) * effective_losing / (winning_pool as u128);
        stake_win.checked_add(u64::try_from(share).map_err(|_| GymError::MathOverflow)?)
            .ok_or(GymError::MathOverflow)?
    };
```

(Also relax the `require!(market.resolved, ...)` guard to `require!(market.resolved || market.refunded, GymError::MarketNotResolved)` so refunded markets are claimable.)

---

## 6. NEW `refund_market` — no-show / decline → everyone gets their stake back

```rust
pub fn refund_market(ctx: Context<RefundMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(!market.resolved, GymError::MarketResolved);
    market.refunded = true;
    Ok(())
}

#[derive(Accounts)]
pub struct RefundMarket<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority @ GymError::Unauthorized,
        seeds = [b"market", market.creator.as_ref(), market.slug.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}
```

Bettors then call the existing `claim_winnings` to pull their stake back.

---

## 7. New error variants

```rust
#[msg("Total fees exceed 100%")] FeeTooHigh,
#[msg("The influencer cannot bet on their own line")] InfluencerCannotBet,
#[msg("Betting is locked (within 12h of the deadline)")] MarketLocked,
```

---

## 8. After deploying

1. `build` → `deploy` in Playground; the **Program Id stays the same** (it's in `declare_id!`).
2. **Re-export the IDL** over BOTH `solana/idl/gymcast.json` and `frontend/src/idl/gymcast.json`.
3. Update `frontend/src/lib/market.ts` `initializeMarket()` to pass the new args
   (`influencer`, `platform`, `creator_fee_bps`, `platform_fee_bps`), sourced from the
   line's `creatorWallet`, a platform wallet, and `challenge.creatorFeeBps`/`platformFeeBps`.
4. Wire `refund_market` into the backend's `refundChallenge()` and `resolve_market`'s
   fee accounts into `finalizeChallenge()` (both currently gated behind `env.solanaEnabled`
   and `marketPda`, so they no-op until this ships).

Until then, every rule and number is live in web2 — the chain just mirrors it.
