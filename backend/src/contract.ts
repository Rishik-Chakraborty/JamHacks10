/**
 * Backend barrel for the shared contract.
 * All backend code imports domain/API/socket types from here (`../contract`),
 * NOT directly from ../../shared — this keeps a single stable import specifier.
 */
export * from '../../shared/types';
