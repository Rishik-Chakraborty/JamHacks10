//! the gainsXchange — parimutuel YES/NO prediction market on Solana (devnet).
//!
//! New-model program: a CHALLENGER opens a market on an INFLUENCER (the subject),
//! spectators bet YES/NO, the off-chain oracle (`authority`) resolves it after the
//! deadline, and winners claim a proportional share of the losing pool — AFTER a
//! creator cut (to the influencer) and a platform fee are skimmed off. The
//! influencer may never bet, betting locks 12h before the deadline, and the
//! authority can `refund_market` (no-show / decline) so everyone reclaims stake.
//!
//! Checked integer math; PDA signer seeds for all vault withdrawals.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("Gg39XD25iRQTxauZuDfBVkoEVKjnaUZT1iscyhyqyXWs");

/// On-chain outcome encoding (matches shared/types.ts).
pub const OUTCOME_UNSET: u8 = 0;
pub const OUTCOME_YES: u8 = 1;
pub const OUTCOME_NO: u8 = 2;

/// On-chain bet side encoding (matches shared/types.ts).
pub const SIDE_YES: u8 = 0;
pub const SIDE_NO: u8 = 1;

/// Max slug length used as a PDA seed.
pub const MAX_SLUG_LEN: usize = 32;

/// Basis-points denominator (10000 = 100%).
pub const BPS_DENOM: u128 = 10_000;

#[program]
pub mod gymcast {
    use super::*;

    /// Create a per-line market. `creator` (the challenger) + `slug` define the
    /// Market PDA. `authority` resolves it; `influencer` is the subject (earns the
    /// creator cut, can't bet); `platform` receives the platform fee.
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        deadline: i64,
        authority: Pubkey,
        influencer: Pubkey,
        platform: Pubkey,
        creator_fee_bps: u16,
        platform_fee_bps: u16,
        slug: String,
    ) -> Result<()> {
        require!(slug.len() <= MAX_SLUG_LEN, GymError::SlugTooLong);
        require!(
            (creator_fee_bps as u128) + (platform_fee_bps as u128) <= BPS_DENOM,
            GymError::FeeTooHigh
        );
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

    /// Place a YES/NO bet. The influencer can't bet; betting is open until the
    /// deadline. Transfers `amount` lamports bettor -> vault.
    pub fn place_bet(ctx: Context<PlaceBet>, side: u8, amount: u64) -> Result<()> {
        require!(amount > 0, GymError::ZeroAmount);
        require!(side == SIDE_YES || side == SIDE_NO, GymError::InvalidSide);

        let market = &mut ctx.accounts.market;
        require!(!market.resolved && !market.refunded, GymError::MarketResolved);

        // The influencer cannot bet on their own line.
        require!(
            ctx.accounts.bettor.key() != market.influencer,
            GymError::InfluencerCannotBet
        );

        // Betting is open right up until the deadline.
        let now = Clock::get()?.unix_timestamp;
        require!(now < market.deadline, GymError::MarketLocked);

        // Escrow: bettor -> vault.
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

    /// Resolve the market. Only the oracle `authority`; the trusted oracle may
    /// resolve at any time (the backend gates the timing). Skims the creator cut
    /// (-> influencer) + platform fee from the losing pool.
    pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: u8) -> Result<()> {
        require!(
            outcome == OUTCOME_YES || outcome == OUTCOME_NO,
            GymError::InvalidOutcome
        );

        // --- Validate + check the fee recipients match the stored ones. ---
        {
            let market = &ctx.accounts.market;
            require!(!market.resolved && !market.refunded, GymError::MarketResolved);
            // No on-chain deadline wait — only the trusted oracle authority can
            // reach this (enforced by `has_one = authority`), and the backend
            // decides when to settle.
            require!(ctx.accounts.influencer.key() == market.influencer, GymError::Unauthorized);
            require!(ctx.accounts.platform.key() == market.platform, GymError::Unauthorized);
        }

        // --- Snapshot the values needed for fee math (drops the borrow). ---
        let (creator_fee, platform_fee, vault_bump, market_key) = {
            let market = &ctx.accounts.market;
            let (winning_pool, losing_pool) = if outcome == OUTCOME_YES {
                (market.yes_pool, market.no_pool)
            } else {
                (market.no_pool, market.yes_pool)
            };
            let (cf, pf) = if winning_pool > 0 && losing_pool > 0 {
                (
                    ((losing_pool as u128) * (market.creator_fee_bps as u128) / BPS_DENOM) as u64,
                    ((losing_pool as u128) * (market.platform_fee_bps as u128) / BPS_DENOM) as u64,
                )
            } else {
                (0u64, 0u64)
            };
            (cf, pf, market.vault_bump, market.key())
        };

        // --- Mark resolved. ---
        {
            let market = &mut ctx.accounts.market;
            market.resolved = true;
            market.outcome = outcome;
        }

        // --- Pay the fees out of the vault (PDA signer). ---
        if creator_fee > 0 || platform_fee > 0 {
            let vault_seeds: &[&[u8]] = &[b"vault", market_key.as_ref(), &[vault_bump]];
            let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

            if creator_fee > 0 {
                require!(ctx.accounts.vault.lamports() >= creator_fee, GymError::InsufficientVault);
                system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.influencer.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    creator_fee,
                )?;
            }
            if platform_fee > 0 {
                require!(ctx.accounts.vault.lamports() >= platform_fee, GymError::InsufficientVault);
                system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.platform.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    platform_fee,
                )?;
            }
        }

        Ok(())
    }

    /// Refund a market (influencer no-show / declined). Authority-only; afterwards
    /// every bettor reclaims their own stake via `claim_winnings`.
    pub fn refund_market(ctx: Context<RefundMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(!market.resolved, GymError::MarketResolved);
        market.refunded = true;
        Ok(())
    }

    /// Claim winnings (or a refund) for the caller's position.
    ///
    /// Refunded / one-sided markets return own stake. Otherwise winners get
    /// stake_win + a proportional share of the losing pool AFTER fees.
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        require!(market.resolved || market.refunded, GymError::MarketNotResolved);

        let position = &mut ctx.accounts.position;
        require!(!position.claimed, GymError::AlreadyClaimed);

        let (winning_pool, losing_pool, stake_win, stake_lose) = if market.outcome == OUTCOME_YES {
            (market.yes_pool, market.no_pool, position.yes_amount, position.no_amount)
        } else {
            (market.no_pool, market.yes_pool, position.no_amount, position.yes_amount)
        };

        let payout: u64 = if market.refunded || losing_pool == 0 || winning_pool == 0 {
            // Refund / one-sided: return own total stake.
            stake_win.checked_add(stake_lose).ok_or(GymError::MathOverflow)?
        } else if stake_win == 0 {
            0
        } else {
            // Winners split the losing pool AFTER the creator + platform fees.
            let fee_bps = (market.creator_fee_bps as u128) + (market.platform_fee_bps as u128);
            let effective_losing = (losing_pool as u128)
                .checked_mul(BPS_DENOM - fee_bps)
                .ok_or(GymError::MathOverflow)?
                / BPS_DENOM;
            let share = (stake_win as u128)
                .checked_mul(effective_losing)
                .ok_or(GymError::MathOverflow)?
                .checked_div(winning_pool as u128)
                .ok_or(GymError::MathOverflow)?;
            let share_u64 = u64::try_from(share).map_err(|_| GymError::MathOverflow)?;
            stake_win.checked_add(share_u64).ok_or(GymError::MathOverflow)?
        };

        position.claimed = true;
        if payout == 0 {
            return Ok(());
        }

        let market_key = market.key();
        let vault_bump = market.vault_bump;
        let vault_seeds: &[&[u8]] = &[b"vault", market_key.as_ref(), &[vault_bump]];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

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
#[instruction(deadline: i64, authority: Pubkey, influencer: Pubkey, platform: Pubkey, creator_fee_bps: u16, platform_fee_bps: u16, slug: String)]
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

    #[account(seeds = [b"vault", market.key().as_ref()], bump)]
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

    #[account(mut, seeds = [b"vault", market.key().as_ref()], bump = market.vault_bump)]
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

    #[account(mut, seeds = [b"vault", market.key().as_ref()], bump = market.vault_bump)]
    pub vault: SystemAccount<'info>,

    /// The influencer — receives the creator cut. Verified against market.influencer.
    #[account(mut)]
    pub influencer: SystemAccount<'info>,

    /// The platform fee recipient. Verified against market.platform.
    #[account(mut)]
    pub platform: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
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

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), market.slug.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [b"vault", market.key().as_ref()], bump = market.vault_bump)]
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
    pub creator: Pubkey,        // the challenger who opened it
    pub authority: Pubkey,      // oracle that resolves
    pub influencer: Pubkey,     // subject; earns the creator cut; cannot bet
    pub platform: Pubkey,       // platform fee recipient
    pub creator_fee_bps: u16,   // e.g. 500 = 5%
    pub platform_fee_bps: u16,  // e.g. 250 = 2.5%
    pub deadline: i64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub resolved: bool,
    pub refunded: bool,
    pub outcome: u8,
    pub slug: String,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Market {
    // 8 disc + 32 creator + 32 authority + 32 influencer + 32 platform + 2 + 2
    // + 8 deadline + 8 yes + 8 no + 1 resolved + 1 refunded + 1 outcome
    // + (4 + MAX_SLUG_LEN) slug + 1 bump + 1 vault_bump
    pub const SPACE: usize =
        8 + 32 + 32 + 32 + 32 + 2 + 2 + 8 + 8 + 8 + 1 + 1 + 1 + (4 + MAX_SLUG_LEN) + 1 + 1;
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
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

#[error_code]
pub enum GymError {
    #[msg("Slug exceeds the maximum length")]
    SlugTooLong,
    #[msg("Total fees exceed 100%")]
    FeeTooHigh,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Bet amount must be greater than zero")]
    ZeroAmount,
    #[msg("Side must be 0 (YES) or 1 (NO)")]
    InvalidSide,
    #[msg("The influencer cannot bet on their own line")]
    InfluencerCannotBet,
    #[msg("Betting is locked (within 12h of the deadline)")]
    MarketLocked,
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
