//! GymCast — parimutuel YES/NO prediction market on Solana (devnet).
//!
//! Per-challenge escrow: spectators bet YES or NO; the off-chain oracle
//! (the `authority` keypair) resolves the market after the deadline; winners
//! claim a proportional share of the losing pool. One-sided markets and
//! markets with no winners refund each bettor's own stake.
//!
//! All payouts use checked integer math and PDA signer seeds for vault
//! withdrawals (`invoke_signed`). Outcome / side encodings mirror
//! `shared/types.ts` (OUTCOME_*, SIDE_*).

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("Gym1111111111111111111111111111111111111111");

/// On-chain outcome encoding (matches shared/types.ts).
pub const OUTCOME_UNSET: u8 = 0;
pub const OUTCOME_YES: u8 = 1;
pub const OUTCOME_NO: u8 = 2;

/// On-chain bet side encoding (matches shared/types.ts).
pub const SIDE_YES: u8 = 0;
pub const SIDE_NO: u8 = 1;

/// Max slug length used as a PDA seed (keeps seed under the 32-byte limit).
pub const MAX_SLUG_LEN: usize = 32;

#[program]
pub mod gymcast {
    use super::*;

    /// Create a per-challenge market. The `creator` and `slug` define the
    /// Market PDA; `authority` is the oracle pubkey that may resolve it.
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        deadline: i64,
        authority: Pubkey,
        slug: String,
    ) -> Result<()> {
        require!(slug.len() <= MAX_SLUG_LEN, GymError::SlugTooLong);
        let now = Clock::get()?.unix_timestamp;
        require!(deadline > now, GymError::DeadlineInPast);

        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.authority = authority;
        market.deadline = deadline;
        market.yes_pool = 0;
        market.no_pool = 0;
        market.resolved = false;
        market.outcome = OUTCOME_UNSET;
        market.slug = slug;
        market.bump = ctx.bumps.market;
        market.vault_bump = ctx.bumps.vault;

        Ok(())
    }

    /// Place a YES/NO bet. Transfers `amount` lamports bettor -> vault and
    /// bumps both the market pool and the bettor's position.
    pub fn place_bet(ctx: Context<PlaceBet>, side: u8, amount: u64) -> Result<()> {
        require!(amount > 0, GymError::ZeroAmount);
        require!(
            side == SIDE_YES || side == SIDE_NO,
            GymError::InvalidSide
        );

        let market = &mut ctx.accounts.market;
        require!(!market.resolved, GymError::MarketResolved);

        let now = Clock::get()?.unix_timestamp;
        require!(now < market.deadline, GymError::MarketClosed);

        // Escrow: bettor -> vault via the system program.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.bettor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let position = &mut ctx.accounts.position;
        // Initialize position on first bet.
        if position.bettor == Pubkey::default() {
            position.bettor = ctx.accounts.bettor.key();
            position.market = market.key();
            position.yes_amount = 0;
            position.no_amount = 0;
            position.claimed = false;
            position.bump = ctx.bumps.position;
        }

        if side == SIDE_YES {
            market.yes_pool = market.yes_pool.checked_add(amount).ok_or(GymError::MathOverflow)?;
            position.yes_amount = position
                .yes_amount
                .checked_add(amount)
                .ok_or(GymError::MathOverflow)?;
        } else {
            market.no_pool = market.no_pool.checked_add(amount).ok_or(GymError::MathOverflow)?;
            position.no_amount = position
                .no_amount
                .checked_add(amount)
                .ok_or(GymError::MathOverflow)?;
        }

        Ok(())
    }

    /// Resolve the market to an outcome. Only the oracle `authority` may call,
    /// and only after the deadline has passed.
    pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: u8) -> Result<()> {
        require!(
            outcome == OUTCOME_YES || outcome == OUTCOME_NO,
            GymError::InvalidOutcome
        );

        let market = &mut ctx.accounts.market;
        require!(!market.resolved, GymError::MarketResolved);

        let now = Clock::get()?.unix_timestamp;
        require!(now >= market.deadline, GymError::DeadlineNotReached);

        market.resolved = true;
        market.outcome = outcome;

        Ok(())
    }

    /// Claim winnings (or a refund) for the caller's position.
    ///
    /// Payout = stake_win + stake_win * losing_pool / winning_pool.
    /// One-sided market (empty losing or winning pool) or a position with no
    /// winning stake on the resolved side refunds the bettor's own stake.
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        require!(market.resolved, GymError::MarketNotResolved);

        let position = &mut ctx.accounts.position;
        require!(!position.claimed, GymError::AlreadyClaimed);

        // Determine winning / losing pools and this bettor's winning stake.
        let (winning_pool, losing_pool, stake_win, stake_lose) = if market.outcome == OUTCOME_YES {
            (market.yes_pool, market.no_pool, position.yes_amount, position.no_amount)
        } else {
            (market.no_pool, market.yes_pool, position.no_amount, position.yes_amount)
        };

        // Compute the lamports owed to this bettor.
        // - One-sided market (no losing stake, or empty winning pool): refund
        //   the bettor's own total stake on both sides.
        // - Otherwise: winners get stake_win + proportional share of losing pool;
        //   losers get nothing.
        let payout: u64 = if losing_pool == 0 || winning_pool == 0 {
            // No counterparty (one-sided or empty): refund own stake.
            stake_win
                .checked_add(stake_lose)
                .ok_or(GymError::MathOverflow)?
        } else if stake_win == 0 {
            // Bettor was entirely on the losing side: nothing to claim.
            0
        } else {
            // Proportional share of the losing pool: stake_win * losing_pool / winning_pool.
            let share = (stake_win as u128)
                .checked_mul(losing_pool as u128)
                .ok_or(GymError::MathOverflow)?
                .checked_div(winning_pool as u128)
                .ok_or(GymError::MathOverflow)?;
            let share_u64 = u64::try_from(share).map_err(|_| GymError::MathOverflow)?;
            stake_win
                .checked_add(share_u64)
                .ok_or(GymError::MathOverflow)?
        };

        position.claimed = true;

        if payout == 0 {
            return Ok(());
        }

        // Transfer payout vault -> bettor using the vault PDA signer seeds.
        let market_key = market.key();
        let vault_bump = market.vault_bump;
        let vault_seeds: &[&[u8]] = &[b"vault", market_key.as_ref(), &[vault_bump]];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

        // Guard against draining more than the vault holds.
        let vault_balance = ctx.accounts.vault.lamports();
        require!(vault_balance >= payout, GymError::InsufficientVault);

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.bettor.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
        )?;

        Ok(())
    }
}

/* -------------------------------------------------------------------------- */
/* Accounts                                                                   */
/* -------------------------------------------------------------------------- */

#[derive(Accounts)]
#[instruction(deadline: i64, authority: Pubkey, slug: String)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = Market::SPACE,
        seeds = [b"market", creator.key().as_ref(), slug.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,

    /// Escrow vault — a plain SystemAccount owned by the system program so it
    /// can hold and (via PDA signer seeds) release lamports.
    #[account(
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(side: u8, amount: u64)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), market.slug.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = Position::SPACE,
        seeds = [b"position", market.key().as_ref(), bettor.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome: u8)]
pub struct ResolveMarket<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ GymError::Unauthorized,
        seeds = [b"market", market.creator.as_ref(), market.slug.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), market.slug.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mut,
        has_one = bettor @ GymError::Unauthorized,
        seeds = [b"position", market.key().as_ref(), bettor.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

#[account]
pub struct Market {
    pub creator: Pubkey,
    pub authority: Pubkey,
    pub deadline: i64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub resolved: bool,
    pub outcome: u8,
    pub slug: String,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Market {
    // 8 discriminator + 32 creator + 32 authority + 8 deadline + 8 yes_pool
    // + 8 no_pool + 1 resolved + 1 outcome + (4 len + MAX_SLUG_LEN) slug
    // + 1 bump + 1 vault_bump.
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + (4 + MAX_SLUG_LEN) + 1 + 1;
}

#[account]
pub struct Position {
    pub bettor: Pubkey,
    pub market: Pubkey,
    pub yes_amount: u64,
    pub no_amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl Position {
    // 8 discriminator + 32 bettor + 32 market + 8 yes + 8 no + 1 claimed + 1 bump.
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

#[error_code]
pub enum GymError {
    #[msg("Slug exceeds the maximum length")]
    SlugTooLong,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Bet amount must be greater than zero")]
    ZeroAmount,
    #[msg("Side must be 0 (YES) or 1 (NO)")]
    InvalidSide,
    #[msg("Outcome must be 1 (YES) or 2 (NO)")]
    InvalidOutcome,
    #[msg("Market is already resolved")]
    MarketResolved,
    #[msg("Market is closed for betting (past deadline)")]
    MarketClosed,
    #[msg("Deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Market is not resolved yet")]
    MarketNotResolved,
    #[msg("Winnings already claimed")]
    AlreadyClaimed,
    #[msg("Not authorized for this action")]
    Unauthorized,
    #[msg("Checked arithmetic overflow")]
    MathOverflow,
    #[msg("Vault has insufficient lamports for payout")]
    InsufficientVault,
}
